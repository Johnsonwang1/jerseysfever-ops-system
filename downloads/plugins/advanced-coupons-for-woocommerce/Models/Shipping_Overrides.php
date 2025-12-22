<?php
namespace ACFWP\Models;

use ACFWP\Abstracts\Abstract_Main_Plugin_Class;
use ACFWP\Abstracts\Base_Model;
use ACFWP\Helpers\Helper_Functions;
use ACFWP\Helpers\Plugin_Constants;
use ACFWP\Interfaces\Initiable_Interface;
use ACFWP\Interfaces\Model_Interface;
use ACFWP\Models\Objects\Advanced_Coupon;
use Automattic\WooCommerce\Utilities\OrderUtil;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Model that houses the logic of extending the coupon system of woocommerce.
 * It houses the logic of handling coupon url.
 * Public Model.
 *
 * @since 2.0
 */
class Shipping_Overrides extends Base_Model implements Model_Interface, Initiable_Interface {
    /*
    |--------------------------------------------------------------------------
    | Class Methods
    |--------------------------------------------------------------------------
     */

    /**
     * Class constructor.
     *
     * @since 2.0
     * @access public
     *
     * @param Abstract_Main_Plugin_Class $main_plugin      Main plugin object.
     * @param Plugin_Constants           $constants        Plugin constants object.
     * @param Helper_Functions           $helper_functions Helper functions object.
     */
    public function __construct( Abstract_Main_Plugin_Class $main_plugin, Plugin_Constants $constants, Helper_Functions $helper_functions ) {
        parent::__construct( $main_plugin, $constants, $helper_functions );
        $main_plugin->add_to_all_plugin_models( $this );
        $main_plugin->add_to_public_models( $this );
    }

    /*
    |--------------------------------------------------------------------------
    | Implementation related  functions.
    |--------------------------------------------------------------------------
     */

    /**
     * Implement shipping overrides.
     *
     * @since 2.0
     * @access public
     */
    public function implement_shipping_overrides() {
        foreach ( \WC()->cart->get_applied_coupons() as $code ) {
            $is_applied = $this->_implement_shipping_overrides_for_coupon( $code );

            // don't proceed with other applied coupons if a discount was already applied.
            if ( $is_applied ) {
                break;
            }
        }
    }

    /**
     * Implement shipping overrides for coupon.
     *
     * @since 2.0
     * @access public
     *
     * @param string $coupon_code Coupon code.
     */
    private function _implement_shipping_overrides_for_coupon( $coupon_code ) {
        $coupon    = new Advanced_Coupon( $coupon_code );
        $overrides = $coupon->get_advanced_prop( 'shipping_overrides', array() );
        $discounts = array();

        if ( ! is_array( $overrides ) || empty( $overrides ) ) {
            return false;
        }

        $classnames = \WC()->shipping->get_shipping_method_class_names();
        $cart_fees  = \WC()->cart->get_fees();

        // get chosen shipping methods.
        $chosen_methods = \WC()->cart->calculate_shipping();

        // detect shipping classes found in cart.
        $shipping_classes = $this->_find_shipping_classes_from_cart();

        foreach ( $chosen_methods as $shipping_rate ) {

            $instance_id = $shipping_rate->get_instance_id();
            $method_id   = $shipping_rate->get_method_id();

            // get the classname of the shipping method of current shipping rate.
            // added filter to allow 3rd party shipping plugins to override the classname value.
            $classname = isset( $classnames[ $method_id ] ) ? $classnames[ $method_id ] : '';
            $classname = apply_filters( 'acfwp_shipping_overrides_classname_support', $classname, $shipping_rate );

            // skip if class doesn't exist.
            if ( ! class_exists( $classname ) ) {
                continue;
            }

            // filter the valid overrides.
            $valid_overrides = $this->_get_valid_shipping_overrides( $overrides, $shipping_rate, $shipping_classes );

            if ( empty( $valid_overrides ) || ! $classname ) {
                continue;
            }

            // Calculatet the discounts based on the valid overrides detected in the cart.
            $this->_calculate_shipping_overrides_discount( $discounts, $classname, $valid_overrides, $shipping_rate, $coupon );
        }

        // return false if there are no discounts to apply.
        if ( empty( $discounts ) ) {
            return false;
        }

        // add valid discounts via Fees API.
        foreach ( $discounts as $instance_id => $discount ) {
            \WC()->cart->fees_api()->add_fee(
                array(
                    'id'      => $discount['id'],
                    'name'    => $discount['name'],
                    'taxable' => $discount['taxable'],
                    'amount'  => $discount['amount'] * -1,
                )
            );
        }

        return true;
    }

    /**
     * Get valid shipping overrides data based on the cart and the currently selected shipping rate.
     *
     * @since 3.5.2
     * @access private
     *
     * @param array             $overrides Coupon shipping overrides data.
     * @param \WC_Shipping_Rate $shipping_rate Shipping rate object.
     * @param array             $shipping_classes List of shipping classes.
     */
    private function _get_valid_shipping_overrides( $overrides, $shipping_rate, $shipping_classes ) {

        $filtered_overrides = array_filter(
            $overrides,
            function ( $data ) use ( $shipping_rate, $shipping_classes ) {

                // return early for nozone options and just validate actual method selected method id.
                if ( 'nozone' === $data['shipping_zone'] ) {
                    return $data['shipping_method'] === $shipping_rate->get_method_id();
                }

                if ( $data['shipping_zone'] < 0 ) {
                    return false;
                }

                // check if shipping method option selected has a specific shipping class.
                if ( strpos( $data['shipping_method'], 'class' ) !== false ) {
                    $temp            = explode( '_class_', $data['shipping_method'] );
                    $shipping_method = absint( $temp[0] );
                    $shipping_class  = absint( $temp[1] );

                    return $shipping_method === $shipping_rate->get_instance_id() && in_array( $shipping_class, $shipping_classes, true );
                }

                // normal method under shipping zone.
                return absint( $data['shipping_method'] ) === $shipping_rate->get_instance_id();
            }
        );

        return array_values( $filtered_overrides );
    }

    /**
     * Calculate the shipping cost for a specific shipping class in the cart.
     *
     * This function loops through the cart items and returns the `class_cost_{term_id}`
     * value from the shipping method settings if a matching shipping class is found.
     *
     * @since 4.0.4
     *
     * @param int               $term_id       The shipping class term ID.
     * @param \WC_Shipping_Rate $shipping_rate The shipping rate object for the current method.
     *
     * @return float The shipping cost for the specified shipping class.
     */
    private function _get_shipping_class_total_cost( $term_id, $shipping_rate ) {
        $cost = 0;

        foreach ( \WC()->cart->get_cart() as $cart_item ) {
            $product_id        = $cart_item['product_id'];
            $product           = wc_get_product( $product_id );
            $shipping_class_id = $product->get_shipping_class_id();

            if ( $term_id === $shipping_class_id ) {
                $settings = get_option( 'woocommerce_' . $shipping_rate->get_method_id() . '_' . $shipping_rate->get_instance_id() . '_settings' );
                $key      = 'class_cost_' . $term_id;

                if ( isset( $settings[ $key ] ) ) {
                    $cost = floatval( $settings[ $key ] );
                }
            }
        }

        return $cost;
    }

    /**
     * Calculatet the discounts based on the valid overrides detected in the cart.
     *
     * @since 3.5.2
     * @access private
     *
     * @param array             $discounts       Discounts data.
     * @param string            $classname       Shipping method classname.
     * @param array             $valid_overrides Valid overrides data.
     * @param \WC_Shipping_Rate $shipping_rate   Shipping rate object.
     * @param Advanced_Coupon   $coupon          Coupon object.
     */
    private function _calculate_shipping_overrides_discount( &$discounts, $classname, $valid_overrides, $shipping_rate, $coupon ) {
        // get shipping method object.
        $method      = new $classname( $shipping_rate->get_instance_id() );
        $instance_id = $shipping_rate->get_instance_id();

        // check if shipping rate is taxable or not.
        $taxable = ! empty( $shipping_rate->get_taxes() ) && array_sum( $shipping_rate->get_taxes() ) > 0;

        foreach ( $valid_overrides as $override ) {

            // calculate discount amount.
            $type                = $override['discount_type'];
            $value               = $override['discount_value'];
            $shipping_class_cost = null;

            // Check if override is tied to a specific shipping class.
            if ( preg_match( '/^(\d+)_class_(\d+)$/', $override['shipping_method'], $matches ) ) {
                $override_instance_id = absint( $matches[1] );
                $shipping_class_id    = absint( $matches[2] );

                if ( $override_instance_id === $instance_id ) {
                    $shipping_class_cost = $this->_get_shipping_class_total_cost( $shipping_class_id, $shipping_rate );
                }
            }

            // Determine amount to calculate discount from.
            $base_amount = null !== $shipping_class_cost ? $shipping_class_cost : $shipping_rate->get_cost();

            $amount = \ACFWF()->Helper_Functions->calculate_discount_by_type( $type, $value, $base_amount );

            if ( $amount <= 0 ) {
                continue;
            }

            // get discount id and name.
            $fee_id   = sprintf( 'acfw-shipping-discount::%s::%s::%s', $coupon->get_code(), $shipping_rate->get_method_id(), $instance_id );
            $fee_name = apply_filters(
                'acfw_shipping_override_fee_name',
                __( 'Shipping discount', 'advanced-coupons-for-woocommerce' ),
                $method,
                $instance_id,
                $override,
                $coupon
            );

            if ( isset( $discounts[ $instance_id ] ) ) {
                $discounts[ $instance_id ]['amount'] += $amount;
            } else {
                $discounts[ $instance_id ] = array(
                    'id'      => $fee_id,
                    'name'    => $fee_name,
                    'amount'  => $amount,
                    'taxable' => $taxable,
                );
            }
        }
    }

    /**
     * Remove tax data for non-taxable shipping discounts.
     *
     * @since 2.6.1
     * @access public
     *
     * @param array  $taxes Fee taxes data.
     * @param object $fee  Fee object data in cart.
     * @return array Filtered fee taxes data.
     */
    public function remove_taxes_for_non_taxable_shipping_discounts( $taxes, $fee ) {
        if ( strpos( $fee->object->id, 'acfw-shipping-discount' ) !== false && ! $fee->taxable ) {
            return array();
        }

        return $taxes;
    }

    /**
     * Save shipping discount meta data on checkout process.
     *
     * @since 2.6.1
     * @access public
     *
     * @param WC_Order_Item_Fee $item    Fee item object.
     * @param string            $fee_key Loop key.
     * @param object            $fee     Fee data available in cart.
     */
    public function save_shipping_discount_metadata( $item, $fee_key, $fee ) {
        if ( strpos( $fee->id, 'acfw-shipping-discount' ) === false ) {
            return;
        }

        $data = explode( '::', $fee->id );
        $item->add_meta_data( 'acfw_fee_cart_id', $fee->id, true );
        $item->add_meta_data(
            'acfw_fee_data',
            array(
                'coupon_code'          => isset( $data[1] ) ? $data[1] : '',
                'shipping_method_id'   => isset( $data[2] ) ? $data[2] : '',
                'shipping_instance_id' => isset( $data[3] ) ? $data[3] : '',
            )
        );
    }

    /**
     * Save shipping overrides discounts to the relative coupon order item meta.
     *
     * @since 3.5.2
     * @access public
     *
     * @param int      $order_id    Order id.
     * @param array    $posted_data Order posted data.
     * @param WC_Order $order       Order object.
     */
    public function save_shipping_discounts_to_coupon_order_item( $order_id, $posted_data, $order ) {

        $discount_totals = array();

        foreach ( $order->get_fees() as $fee ) {

            $data = $fee->get_meta( 'acfw_fee_data', true );

            // skip if fee item is not for shipping overrides.
            if ( ! is_array( $data ) || ! isset( $data['coupon_code'] ) || ! $data['coupon_code'] ) {
                continue;
            }

            $coupon_code = $data['coupon_code'];

            // set default total to 0 for coupon that is not yet set on the array.
            if ( ! isset( $discount_totals [ $coupon_code ] ) ) {
                $discount_totals[ $coupon_code ] = 0;
            }

            $discount_totals[ $coupon_code ] += wc_add_number_precision( (float) abs( $fee->get_amount( 'edit' ) ) );
        }

        // skip if order has no shipping override discounts from coupon.
        if ( empty( $discount_totals ) ) {
            return;
        }

        foreach ( $discount_totals as $key => $discount_total ) {

            // get the matching coupon order item.
            $order_coupon = current(
                array_filter(
                    $order->get_coupons(),
                    function ( $oc ) use ( $key ) {
                        return strpos( $oc->get_code(), $key ) !== false;
                    }
                )
            );

            // save total shipping override discount to coupon order item meta.
            $order_coupon->update_meta_data( $this->_constants->ORDER_COUPON_SHIPPING_OVERRIDES_DISCOUNT, wc_remove_number_precision( $discount_total ) );
            $order_coupon->save_meta_data();
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Editing related  functions.
    |--------------------------------------------------------------------------
     */

    /**
     * Populate selectable shipping zones with methods data.
     *
     * @since 2.0
     * @since 2.2.3 Add support for non-shipping zone supported methods.
     * @access public
     *
     * @param array $options List of shipping zones with methods.
     * @return array Filtered list of shipping zones with methods.
     */
    public function populate_selectable_options( $options = array() ) {
        // list to hold all registered methods under a shipping zone.
        $zoned_methods         = array();
        $zoned_methods_reducer = function ( $c, $sm ) {
            return array_merge( $c, array( $sm->id ) );
        };

        // get all shipping zones.
        $zones  = $this->_helper_functions->get_shipping_zones();
        $vl_map = function ( $method ) {
            return array(
                'value' => $method->instance_id,
                'label' => $method->title,
            );
        };

        foreach ( $zones as $zone ) {

            $methods       = array_filter( $zone['shipping_methods'], array( $this, '_validate_shipping_method' ) );
            $options[]     = array(
                'zone_id'   => $zone['zone_id'],
                'zone_name' => $zone['zone_name'],
                'methods'   => $this->_get_zone_shipping_method_options( $methods ),
            );
            $zoned_methods = array_reduce( $methods, $zoned_methods_reducer, $zoned_methods );
        }

        // get shipping methods for "Locations not covered by your other zones".
        $zone_0        = \WC_Shipping_Zones::get_zone( 0 );
        $other_methods = array_filter( $zone_0->get_shipping_methods(), array( $this, '_validate_shipping_method' ) );

        if ( $other_methods && ! empty( $other_methods ) ) {
            $options[]     = array(
                'zone_id'   => 0,
                'zone_name' => __( 'Not covered locations', 'advanced-coupons-for-woocommerce' ),
                'methods'   => array_values( array_map( $vl_map, $other_methods ) ),
            );
            $zoned_methods = array_reduce( $other_methods, $zoned_methods_reducer, $zoned_methods );
        }

        // get methods that doesn't support shipping zones.
        $not_zoned_methods = array_filter(
            \WC()->shipping()->get_shipping_methods(),
            function ( $sm ) use ( $zoned_methods ) {
            return ! in_array( $sm->id, $zoned_methods, true ) && $this->_validate_shipping_method( $sm );
            }
        );

        // add non-zoned methods to a single option.
        if ( $not_zoned_methods && ! empty( $not_zoned_methods ) ) {
            $options[] = array(
                'zone_id'   => 'nozone',
                'zone_name' => __( 'Non-shipping zone methods', 'advanced-coupons-for-woocommerce' ),
                'methods'   => array_values(
                    array_map(
                        function ( $m ) {
                            return array(
                                'value' => $m->id,
                                'label' => $m->title,
                            );
                            },
                        $not_zoned_methods
                    )
                ),
            );
        }

        return $options;
    }

    /**
     * Get shipping method options for a zone given its list of shipping methods.
     *
     * @since 2.3
     * @access private
     *
     * @param array $zone_methods Shipping zone list of shipping methods.
     * @return array list of shipping method options.
     */
    private function _get_zone_shipping_method_options( $zone_methods ) {
        $method_options      = array();
        $shipping_classes    = \WC()->shipping()->get_shipping_classes();
        $shippping_class_ids = array_map(
            function ( $c ) {
            return $c->term_id;
            },
            $shipping_classes
        );

        foreach ( $zone_methods as $zone_method ) {

            $method_options[] = array(
                'value' => $zone_method->instance_id,
                'label' => $zone_method->title,
            );

            if ( ! empty( $shipping_classes ) && in_array( 'instance-settings', $zone_method->supports, true ) ) {

                $method_classes = array_filter(
                    $shipping_classes,
                    function ( $c ) use ( $zone_method ) {
                    $index = 'class_cost_' . $c->term_id;
                    return isset( $zone_method->instance_settings[ $index ] );
                    }
                );

                if ( empty( $method_classes ) ) {
                    continue;
                }

                foreach ( $method_classes as $class ) {
                    $method_options[] = array(
                        'value' => sprintf( '%s_class_%s', $zone_method->instance_id, $class->term_id ),
                        'label' => sprintf( '%s: %s', $zone_method->title, $class->name ),
                    );
                }
            }
        }

        return $method_options;
    }

    /**
     * Sanitize shipping override data.
     *
     * @since 2.0
     * @access private
     *
     * @param array $data Shipping override data.
     * @return array Sanizied shipping override data.
     */
    private function _sanitize_shipping_override( $data ) {
        $sanitized = array();

        if ( 'empty' !== $data && ! empty( $data ) ) {
            foreach ( $data as $key => $row ) {

                $shipping_zone     = 'nozone' === $row['shipping_zone'] ? 'nozone' : absint( $row['shipping_zone'] );
                $sanitized[ $key ] = array(
                    'shipping_zone'   => $shipping_zone >= 0 ? $shipping_zone : 'nozone',
                    'shipping_method' => sanitize_text_field( $row['shipping_method'] ),
                    'discount_type'   => sanitize_text_field( $row['discount_type'] ),
                    'discount_value'  => (float) wc_format_decimal( $row['discount_value'] ),
                );
            }
        }

        return $sanitized;
    }

    /**
     * Save shipping overrides.
     *
     * @since 2.0
     * @access private
     *
     * @param int   $coupon_id Coupon ID.
     * @param array $overrides Shipping overrides data.
     * @return bool True if updated, false otherwise.
     */
    private function _save_shipping_overrides( $coupon_id, $overrides ) {
        return update_post_meta( $coupon_id, $this->_constants->META_PREFIX . 'shipping_overrides', $overrides );
    }

    /**
     * Validate shipping methods.
     *
     * @since 2.0
     * @since 2.2.3 Make validation less strict and add filterable list of disallowed methods.
     * @access private
     *
     * @param WC_Shipping_Method $sm Shipping method.
     * @return boolean True if valid, false otherwise.
     */
    private function _validate_shipping_method( $sm ) {
        $disallowed_methods = apply_filters( 'acfw_disallowed_shipping_methods_for_override', array( 'free_shipping' ) );
        return 'yes' === $sm->enabled && ! in_array( $sm->id, $disallowed_methods, true );
    }

    /*
    |--------------------------------------------------------------------------
    | Order admin related functions.
    |--------------------------------------------------------------------------
     */

    /**
     * Recalculate correct order shipping total with discount.
     *
     * @since 2.2.3
     * @access public
     */
    public function recalculate_shipping_total_with_discount() {
        $order_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
        $order_id = ! $order_id && isset( $_GET['id'] ) ? absint( $_GET['id'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
        if ( ! $order_id || ! OrderUtil::is_order( $order_id, wc_get_order_types() ) ) {
            return;
        }

        // Variables.
        $order          = wc_get_order( $order_id );
        $shipping_total = 0;
        $discount       = 0;

        // skip if order shipping values have already been recalculated.
        if ( $order->get_meta( 'acfw_shipping_discount_recalc' ) === 'yes' ) {
            return;
        }

        // Sum shipping costs.
        foreach ( $order->get_shipping_methods() as $shipping ) {
            $shipping_total += (float) $shipping->get_total( 'edit' );
        }

        foreach ( $order->get_fees() as $fee ) {
            if (
                strpos( $fee->get_name(), '[shipping_discount]' ) !== false ||
                strpos( $fee->get_meta( 'acfw_fee_cart_id' ), 'acfw-shipping-discount' ) !== false
            ) {
                $discount += (float) $fee->get_total( 'edit' );
            }
        }

        if ( ! $discount ) {
            return;
        }

        // we add because discount value is negative already.
        $total = $shipping_total + $discount;

        // set shipping total and make sure value is not negative.
        $order->set_shipping_total( $total >= 0 ? $total : 0 );
        $order->add_meta_data( 'acfw_shipping_discount_recalc', 'yes' );
        $order->save();
    }

    /*
    |--------------------------------------------------------------------------
    | AJAX functions.
    |--------------------------------------------------------------------------
     */

    /**
     * AJAX save shipping overrides.
     *
     * @since 2.0
     * @access public
     */
    public function ajax_save_shipping_overrides() {
        // Validate nonce.
        $nonce = sanitize_key( $_POST['nonce'] ?? '' );
        if ( ! defined( 'DOING_AJAX' ) || ! DOING_AJAX ) {
            $response = array(
                'status'    => 'fail',
                'error_msg' => __( 'Invalid AJAX call', 'advanced-coupons-for-woocommerce' ),
            );
        } elseif ( ! current_user_can( apply_filters( 'acfw_ajax_save_bogo_deals', 'manage_woocommerce' ) )
            || ! $nonce
            || ! wp_verify_nonce( $nonce, 'acfw_save_shipping_overrides' )
        ) {
            $response = array(
                'status'    => 'fail',
                'error_msg' => __( 'You are not allowed to do this', 'advanced-coupons-for-woocommerce' ),
            );
        } elseif ( ! isset( $_POST['coupon_id'] ) || ! isset( $_POST['overrides'] ) ) {
            $response = array(
                'status'    => 'fail',
                'error_msg' => __( 'Missing required post data', 'advanced-coupons-for-woocommerce' ),
            );
        } else {
            $coupon_id = absint( $_POST['coupon_id'] );
            $overrides = $this->_sanitize_shipping_override( $_POST['overrides'] ); // phpcs:ignore
            $check     = $this->_save_shipping_overrides( $coupon_id, $overrides );

            if ( $check ) {
                $response = array(
                    'status'  => 'success',
                    'message' => __( 'Shipping overrides have been saved successfully!', 'advanced-coupons-for-woocommerce' ),
                );
            } else {
                $response = array( 'status' => 'fail' );
            }
        }

        @header( 'Content-Type: application/json; charset=' . get_option( 'blog_charset' ) ); // phpcs:ignore
        echo wp_json_encode( $response );
        wp_die();
    }

    /**
     * AJAX clear shipping overrides.
     *
     * @since 2.0
     * @access public
     */
    public function ajax_clear_shipping_overrides() {
        // Validate nonce.
        $nonce = sanitize_key( $_POST['_wpnonce'] ?? '' );
        if ( ! defined( 'DOING_AJAX' ) || ! DOING_AJAX ) {
            $response = array(
                'status'    => 'fail',
                'error_msg' => __( 'Invalid AJAX call', 'advanced-coupons-for-woocommerce' ),
            );
        } elseif ( ! $nonce || ! wp_verify_nonce( $nonce, 'acfw_clear_shipping_overrides' ) || ! current_user_can( apply_filters( 'acfw_ajax_clear_add_products_data', 'manage_woocommerce' ) ) ) {
            $response = array(
                'status'    => 'fail',
                'error_msg' => __( 'You are not allowed to do this', 'advanced-coupons-for-woocommerce' ),
            );
        } elseif ( ! isset( $_POST['coupon_id'] ) ) {
            $response = array(
                'status'    => 'fail',
                'error_msg' => __( 'Missing required post data', 'advanced-coupons-for-woocommerce' ),
            );
        } else {

            $coupon_id  = intval( $_POST['coupon_id'] );
            $save_check = update_post_meta( $coupon_id, $this->_constants->META_PREFIX . 'shipping_overrides', array() );

            if ( $save_check ) {
                $response = array(
                    'status'  => 'success',
                    'message' => __( 'Shipping overides has been cleared successfully!', 'advanced-coupons-for-woocommerce' ),
                );
            } else {
                $response = array(
                    'status'    => 'fail',
                    'error_msg' => __( 'Failed on clearing or there were no changes to save.', 'advanced-coupons-for-woocommerce' ),
                );
            }
        }

        @header('Content-Type: application/json; charset=' . get_option('blog_charset')); // phpcs:ignore
        echo wp_json_encode( $response );
        wp_die();
    }

    /**
     * Find shipping classes from cart shipping packages.
     *
     * @since 2.4
     * @access private
     *
     * @return array List of detected shipping classes.
     */
    private function _find_shipping_classes_from_cart() {
        $shipping_classes = array();
        $packages         = \WC()->cart->get_shipping_packages();

        foreach ( $packages as $package ) {

            foreach ( $package['contents'] as $item_id => $values ) {

                if ( $values['data']->needs_shipping() ) {
                    $found_class = $values['data']->get_shipping_class_id();
                    if ( $found_class ) {
                        $shipping_classes[] = $found_class;
                    }
                }
            }
        }

        return $shipping_classes;
    }

    /*
    |--------------------------------------------------------------------------
    | Fulfill implemented interface contracts
    |--------------------------------------------------------------------------
     */

    /**
     * Execute codes that needs to run plugin activation.
     *
     * @since 2.0
     * @access public
     * @implements ACFWP\Interfaces\Initializable_Interface
     */
    public function initialize() {
        if ( ! \ACFWF()->Helper_Functions->is_module( Plugin_Constants::SHIPPING_OVERRIDES_MODULE ) ) {
            return;
        }

        add_action( 'wp_ajax_acfw_save_shipping_overrides', array( $this, 'ajax_save_shipping_overrides' ) );
        add_action( 'wp_ajax_acfw_clear_shipping_overrides', array( $this, 'ajax_clear_shipping_overrides' ) );
    }

    /**
     * Execute Shipping_Overrides class.
     *
     * @since 2.0
     * @access public
     * @inherit ACFWP\Interfaces\Model_Interface
     */
    public function run() {
        if ( ! \ACFWF()->Helper_Functions->is_module( Plugin_Constants::SHIPPING_OVERRIDES_MODULE ) ) {
            return;
        }

        add_action( 'woocommerce_cart_calculate_fees', array( $this, 'implement_shipping_overrides' ) );
        add_filter( 'woocommerce_cart_totals_get_fees_from_cart_taxes', array( $this, 'remove_taxes_for_non_taxable_shipping_discounts' ), 10, 2 );
        add_action( 'woocommerce_checkout_create_order_fee_item', array( $this, 'save_shipping_discount_metadata' ), 10, 3 );
        add_action( 'woocommerce_checkout_order_processed', array( $this, 'save_shipping_discounts_to_coupon_order_item' ), 10, 3 );
        add_filter( 'acfw_shipping_override_selectable_options', array( $this, 'populate_selectable_options' ), 10, 1 );
        add_action( 'admin_init', array( $this, 'recalculate_shipping_total_with_discount' ), 10 );
    }
}
