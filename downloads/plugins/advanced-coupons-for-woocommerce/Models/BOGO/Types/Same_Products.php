<?php
namespace ACFWP\Models\BOGO\Types;

use ACFWF\Abstracts\Abstract_BOGO_Deal;
use ACFWP\Abstracts\Abstract_Main_Plugin_Class;
use ACFWP\Abstracts\Base_Model;
use ACFWP\Helpers\Helper_Functions;
use ACFWP\Helpers\Plugin_Constants;
use ACFWP\Interfaces\Model_Interface;
use ACFWP\Models\Objects\Advanced_Coupon;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Model that houses the logic of Same Products BOGO Deals.
 * Public Model.
 *
 * @since 4.0.5
 */
class Same_Products extends Base_Model implements Model_Interface {
    /*
    |--------------------------------------------------------------------------
    | Class Properties
    |--------------------------------------------------------------------------
     */

    /**
     * Property that houses the model name to be used when calling publicly.
     *
     * @since 4.0.5
     * @access private
     * @var string
     */
    private $_model_name = 'BOGO_Same_Products';

    /*
    |--------------------------------------------------------------------------
    | Class Methods
    |--------------------------------------------------------------------------
     */

    /**
     * Class constructor.
     *
     * @since 4.0.5
     * @access public
     *
     * @param Abstract_Main_Plugin_Class $main_plugin      Main plugin object.
     * @param Plugin_Constants           $constants        Plugin constants object.
     * @param Helper_Functions           $helper_functions Helper functions object.
     */
    public function __construct( Abstract_Main_Plugin_Class $main_plugin, Plugin_Constants $constants, Helper_Functions $helper_functions ) {
        parent::__construct( $main_plugin, $constants, $helper_functions );
        $main_plugin->add_to_all_plugin_models( $this, $this->_model_name );
        $main_plugin->add_to_public_models( $this, $this->_model_name );
    }

    /*
    |--------------------------------------------------------------------------
    | Same Products BOGO Integration with Main System
    |--------------------------------------------------------------------------
     */

    /**
     * Prepare Same Products BOGO deal data.
     * For same products, the deal items must be the same as trigger items.
     * This means we need to get the trigger items and use them as deal items.
     *
     * @since 4.0.5
     * @access public
     *
     * @param array  $deals     Deal data.
     * @param array  $raw_deals Raw deal data.
     * @param string $deal_type Deal type.
     * @return array Prepared Deal data.
     */
    public function prepare_same_products_bogo_deal_data( $deals, $raw_deals, $deal_type ) {
        if ( 'same-products' !== $deal_type ) {
            return $deals;
        }

        // For same products, we need to get the trigger IDs that actually triggered the BOGO.
        // This ensures only products that triggered the deal can receive the discount.
        $trigger_product_ids = $this->_get_triggered_product_ids();

        $deals[] = \ACFWF()->Helper_Functions->format_bogo_trigger_deal_entry(
            array(
                'ids'      => $trigger_product_ids, // Only products that triggered the deal.
                'quantity' => $raw_deals['quantity'],
                'discount' => $raw_deals['discount_value'],
                'type'     => $raw_deals['discount_type'],
            ),
            true
        );

        return $deals;
    }

    /**
     * Check if the provided cart item matches Same Products BOGO entries.
     * For same products, we need to ensure trigger and deal are the same product.
     * This only applies to deal entries with 'same-products' type.
     *
     * @since 4.0.5
     * @access public
     *
     * @param int|boolean        $matched    Filter return value.
     * @param array              $cart_item Cart item data.
     * @param array              $entry     Trigger/deal entry.
     * @param boolean            $is_deal   Flag if entry is for deal or not.
     * @param string             $type      Trigger/deal type.
     * @param Abstract_BOGO_Deal $bogo_deal BOGO Deal object.
     * @return int|boolean The cart item compare value if matched, false otherwise.
     */
    public function same_products_bogo_is_cart_item_match_entries( $matched, $cart_item, $entry, $is_deal, $type, $bogo_deal ) {
        // Only handle deal entries with 'same-products' type.
        if ( ! $is_deal || 'same-products' !== $type ) {
            return $matched;
        }

        // For same products deals, we need to check if this cart item was used as a trigger for this BOGO deal.
        if ( $this->_is_cart_item_used_as_trigger( $cart_item, $bogo_deal ) ) {
            $item_id = isset( $cart_item['variation_id'] ) && $cart_item['variation_id'] ? $cart_item['variation_id'] : $cart_item['product_id'];
            $item_id = apply_filters( 'acfw_filter_cart_item_product_id', $item_id );

            return $item_id;
        }

        return false;
    }

    /**
     * Check if a cart item was used as a trigger for the BOGO deal and can receive the discount.
     * For Same Products BOGO, the item must have enough quantity to both trigger AND receive the deal.
     *
     * @since 4.0.5
     * @access private
     *
     * @param array              $cart_item Cart item data.
     * @param Abstract_BOGO_Deal $bogo_deal BOGO Deal object.
     * @return boolean True if cart item was used as trigger and can receive discount, false otherwise.
     */
    private function _is_cart_item_used_as_trigger( $cart_item, $bogo_deal ) {
        $item_id = isset( $cart_item['variation_id'] ) && $cart_item['variation_id'] ? $cart_item['variation_id'] : $cart_item['product_id'];
        $item_id = apply_filters( 'acfw_filter_cart_item_product_id', $item_id );

        // For same products, we need to check if this specific cart item
        // has sufficient quantity to both trigger the BOGO deal AND receive the discount.
        foreach ( $bogo_deal->triggers as $trigger ) {

            // Check if this item matches the trigger IDs.
            // Convert both to integers to ensure type consistency for combination-products.
            $item_id_int     = (int) $item_id;
            $trigger_ids_int = array_map( 'intval', $trigger['ids'] );

            if ( in_array( $item_id_int, $trigger_ids_int, true ) ) {
                $trigger_qty = isset( $trigger['quantity'] ) ? $trigger['quantity'] : 1;
                $cart_qty    = isset( $cart_item['quantity'] ) ? $cart_item['quantity'] : 0;

                // Get deal quantity from the BOGO deal.
                $deal_qty = 1; // Default deal quantity.
                if ( ! empty( $bogo_deal->deals ) ) {
                    foreach ( $bogo_deal->deals as $deal ) {
                        if ( isset( $deal['quantity'] ) ) {
                            $deal_qty = $deal['quantity'];
                            break;
                        }
                    }
                }

                // For Same Products BOGO, the item needs trigger_qty + deal_qty total quantity.
                $required_total_qty = $trigger_qty + $deal_qty;

                if ( $cart_qty >= $required_total_qty ) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Get product IDs that actually triggered the BOGO deal and have sufficient quantity for the deal.
     * For Same Products BOGO, a product must have enough quantity to BOTH trigger AND receive the discount.
     *
     * @since 4.0.5
     * @access private
     *
     * @return array List of product IDs that triggered the deal and can receive discount.
     */
    private function _get_triggered_product_ids() {
        $triggered_ids = array();

        // Get Same Products coupons to check their triggers.
        foreach ( $this->_get_same_products_coupons() as $coupon_code => $coupon ) {
            $bogo_deals = $coupon->get_advanced_prop( 'bogo_deals', array() );

            if ( ! isset( $bogo_deals['conditions'] ) || ! isset( $bogo_deals['deals'] ) ) {
                continue;
            }

            $trigger_qty = isset( $bogo_deals['conditions']['quantity'] ) ? $bogo_deals['conditions']['quantity'] : 1;
            $deal_qty    = isset( $bogo_deals['deals']['quantity'] ) ? $bogo_deals['deals']['quantity'] : 1;

            // For Same Products BOGO, the product needs trigger_qty + deal_qty total quantity.
            $required_total_qty = $trigger_qty + $deal_qty;

            // Check each cart item to see if it meets both trigger and deal requirements.
            foreach ( \WC()->cart->get_cart() as $cart_item ) {
                $item_id = isset( $cart_item['variation_id'] ) && $cart_item['variation_id'] ? $cart_item['variation_id'] : $cart_item['product_id'];
                $item_id = apply_filters( 'acfw_filter_cart_item_product_id', $item_id );

                // Check if this item has sufficient quantity to both trigger AND receive the deal.
                if ( $cart_item['quantity'] >= $required_total_qty ) {
                    $triggered_ids[] = $item_id;
                }
            }
        }

        return array_unique( $triggered_ids );
    }


    /**
     * Get Same Products coupons from applied coupons.
     *
     * @since 4.0.5
     * @access private
     *
     * @return array Same Products coupons.
     */
    private function _get_same_products_coupons() {
        $same_products_coupons = array();
        foreach ( \WC()->cart->get_applied_coupons() as $coupon_code ) {
            $coupon = new Advanced_Coupon( $coupon_code );

            if ( $coupon->is_type( 'acfw_bogo' ) ) {
                $bogo_deals = $coupon->get_advanced_prop( 'bogo_deals', array() );
                // Same Products is identified by deals_type, not conditions_type.
                if ( isset( $bogo_deals['deals_type'] ) && 'same-products' === $bogo_deals['deals_type'] ) {
                    $same_products_coupons[ $coupon_code ] = $coupon;
                }
            }
        }
        return $same_products_coupons;
    }

    /*
    |--------------------------------------------------------------------------
    | Auto Add Deal Products Integration
    |--------------------------------------------------------------------------
     */

    /**
     * Handle Same Products auto-add directly without using filter system.
     * This completely bypasses the Frontend.php auto-add to prevent infinite loops.
     *
     * @since 4.0.5
     * @access public
     *
     * @param Abstract_BOGO_Deal $bogo_deal BOGO Deal object.
     */
    public function handle_same_products_auto_add_direct( $bogo_deal ) {
        // Only handle same-products deal type.
        if ( 'same-products' !== $bogo_deal->deal_type ) {
            return;
        }

        // Skip if deals already verified or if triggers are not verified.
        if ( 0 >= $bogo_deal->get_allowed_deal_quantity() || 0 < $bogo_deal->get_needed_trigger_quantity() ) {
            return;
        }

        $coupon = $bogo_deal->get_coupon();
        $coupon = $coupon instanceof Advanced_Coupon ? $coupon : new Advanced_Coupon( $coupon );

        // Don't proceed when auto-add setting is not enabled.
        if ( ! $coupon->get_advanced_prop( 'bogo_auto_add_products' ) ) {
            return;
        }

        // Use a more robust mechanism to prevent loops.
        $processing_key = 'acfw_same_products_processing_' . $bogo_deal->get_coupon()->get_code();

        // Check if already processing for this specific coupon.
        if ( $this->_is_already_processing( $processing_key ) ) {
            return;
        }

        // Mark as processing.
        $this->_mark_as_processing( $processing_key );

        try {
            // Execute the auto-add logic.
            $this->_execute_same_products_auto_add( $bogo_deal, $coupon );
        } finally {
            // Always clean up the flag.
            $this->_cleanup_processing_flag( $processing_key );
        }
    }

    /**
     * Execute Same Products auto-add logic without causing loops.
     *
     * @since 4.0.5
     * @access private
     *
     * @param Abstract_BOGO_Deal $bogo_deal BOGO Deal object.
     * @param Advanced_Coupon    $coupon    Coupon object.
     */
    private function _execute_same_products_auto_add( $bogo_deal, $coupon ) {
        // Get cart contents directly.
        $cart_contents = \WC()->cart->get_cart_contents();

        if ( empty( $cart_contents ) ) {
            return;
        }

        // Find a cart item that can trigger the deal.
        $trigger_cart_item = null;
        $trigger_qty       = 1;

        // Get trigger quantity from BOGO deal.
        if ( ! empty( $bogo_deal->triggers ) ) {
            foreach ( $bogo_deal->triggers as $trigger ) {
                if ( isset( $trigger['quantity'] ) ) {
                    $trigger_qty = $trigger['quantity'];
                    break;
                }
            }
        }

        // Find cart item with sufficient quantity to trigger.
        foreach ( $cart_contents as $cart_item ) {
            if ( $cart_item['quantity'] >= $trigger_qty ) {
                $trigger_cart_item = $cart_item;
                break;
            }
        }

        if ( ! $trigger_cart_item ) {
            return;
        }

        // Get deal quantity.
        $deal_qty = 1;
        if ( ! empty( $bogo_deal->deals ) ) {
            foreach ( $bogo_deal->deals as $deal ) {
                if ( isset( $deal['quantity'] ) ) {
                    $deal_qty = $deal['quantity'];
                    break;
                }
            }
        }

        // Add the same product to cart.
        $product_id   = $trigger_cart_item['product_id'];
        $variation_id = $trigger_cart_item['variation_id'];

        // Completely remove all BOGO hooks to prevent any loops.
        remove_action( 'woocommerce_before_calculate_totals', array( \ACFWF()->BOGO_Frontend, 'implement_bogo_deals' ), apply_filters( 'acfw_bogo_implementation_priority', 11 ) );
        remove_action( 'acfw_bogo_after_verify_trigger_deals', array( $this, 'handle_same_products_auto_add_direct' ), 5 );

        // Add product to cart.
        $variation_data = apply_filters( 'acfw_bogo_auto_add_product_variation_data', array(), $variation_id );
        \WC()->cart->add_to_cart( $product_id, $deal_qty, $variation_id, $variation_data );

        // Re-add hooks after cart modification.
        add_action( 'woocommerce_before_calculate_totals', array( \ACFWF()->BOGO_Frontend, 'implement_bogo_deals' ), apply_filters( 'acfw_bogo_implementation_priority', 11 ) );
        add_action( 'acfw_bogo_after_verify_trigger_deals', array( $this, 'handle_same_products_auto_add_direct' ), 5 );
    }

    /**
     * Check if already processing for a specific coupon.
     *
     * @since 4.0.5
     * @access private
     *
     * @param string $key Processing key.
     * @return bool True if already processing, false otherwise.
     */
    private function _is_already_processing( $key ) {
        return get_transient( $key ) !== false;
    }

    /**
     * Mark processing for a specific coupon.
     *
     * @since 4.0.5
     * @access private
     *
     * @param string $key Processing key.
     */
    private function _mark_as_processing( $key ) {
        set_transient( $key, time(), 30 ); // 30 second timeout.
    }

    /**
     * Clean up processing flag.
     *
     * @since 4.0.5
     * @access private
     *
     * @param string $key Processing key.
     */
    private function _cleanup_processing_flag( $key ) {
        delete_transient( $key );
    }

    /*
    |--------------------------------------------------------------------------
    | Admin Integration Hooks
    |--------------------------------------------------------------------------
     */

    /**
     * Register apply type same products options.
     *
     * @since 4.0.5
     * @access public
     *
     * @param array $options Field options list.
     * @return array Filtered field options list.
     */
    public function register_apply_type_options( $options ) {
        return array_merge(
            $options,
            array(
                'same-products' => __( 'Same Products', 'advanced-coupons-for-woocommerce' ),
            )
        );
    }

    /**
     * Filter sanitize same products data.
     *
     * @since 4.0.5
     * @access public
     *
     * @param array  $sanitized Sanized data.
     * @param array  $data      Raw data.
     * @param string $type      Data type.
     * @return array Sanitized data.
     */
    public function filter_sanitize_bogo_data( $sanitized, $data, $type ) {
        switch ( $type ) {
            case 'same-products':
                $sanitized = $this->_sanitize_same_products_data( $data );
                break;
        }

        return $sanitized;
    }

    /**
     * Sanitize conditions/deals same products data.
     *
     * @since 4.0.5
     * @access private
     *
     * @param array $data Product data.
     * @return array Sanitized product data.
     */
    private function _sanitize_same_products_data( $data ) {
        if ( ! isset( $data['discount_type'] ) ) { // sanitize trigger data.

            $sanitized = array(
                'quantity' => isset( $data['quantity'] ) && intval( $data['quantity'] ) > 0 ? absint( $data['quantity'] ) : 1,
            );

        } else { // sanitize apply data.

            $sanitized = array(
                'quantity'       => isset( $data['quantity'] ) && intval( $data['quantity'] ) > 0 ? absint( $data['quantity'] ) : 1,
                'discount_type'  => isset( $data['discount_type'] ) ? sanitize_text_field( $data['discount_type'] ) : 'override',
                'discount_value' => isset( $data['discount_value'] ) ? (float) wc_format_decimal( $data['discount_value'] ) : (float) 0,
            );
        }

        return $sanitized;
    }

    /*
    |--------------------------------------------------------------------------
    | Fulfill implemented interface contracts
    |--------------------------------------------------------------------------
     */

    /**
     * Execute Same Products class.
     *
     * @since 4.0.5
     * @access public
     * @inherit ACFWP\Interfaces\Model_Interface
     */
    public function run() {
        if ( ! \ACFWF()->Helper_Functions->is_module( Plugin_Constants::BOGO_DEALS_MODULE ) ) {
            return;
        }

        // Admin integration hooks.
        add_filter( 'acfw_bogo_apply_type_options', array( $this, 'register_apply_type_options' ), 10 );
        add_filter( 'acfw_sanitize_bogo_deals_data', array( $this, 'filter_sanitize_bogo_data' ), 10, 3 );

        // Integrate with main BOGO system for Same Products deals.
        add_filter( 'acfw_bogo_advanced_prepare_deal_data', array( $this, 'prepare_same_products_bogo_deal_data' ), 10, 3 );
        add_filter( 'acfw_bogo_is_cart_item_match_entries', array( $this, 'same_products_bogo_is_cart_item_match_entries' ), 10, 6 );

        // Auto-add deal products integration with separate action to avoid infinite loops.
        add_action( 'acfw_bogo_after_verify_trigger_deals', array( $this, 'handle_same_products_auto_add_direct' ), 5 );
    }
}
