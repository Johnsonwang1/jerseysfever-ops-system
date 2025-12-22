<?php
namespace ACFWP\Models;

use ACFWP\Abstracts\Abstract_Main_Plugin_Class;
use ACFWP\Abstracts\Base_Model;
use ACFWP\Helpers\Helper_Functions;
use ACFWP\Helpers\Plugin_Constants;
use ACFWP\Interfaces\Initiable_Interface;
use ACFWP\Interfaces\Model_Interface;
use ACFWP\Models\Objects\Advanced_Coupon;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Model that houses the logic of the Auto_Apply module.
 *
 * @since 2.0
 */
class Auto_Apply extends Base_Model implements Model_Interface, Initiable_Interface {
    /*
    |--------------------------------------------------------------------------
    | Class Properties
    |--------------------------------------------------------------------------
     */

    /**
     * Coupon base url.
     *
     * @since 2.0
     * @access private
     * @var string
     */
    private $_coupon_base_url;

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
    | Auto_Apply implementation
    |--------------------------------------------------------------------------
     */

    /**
     * Auto apply single coupon.
     *
     * @since 2.0
     * @since 3.3.1 use correct function to add coupon to cart.
     * @access public
     *
     * @param Advanced_Coupon $coupon    Advanced coupon object.
     * @param WC_Discounts    $discounts WooCommerce discounts object.
     * @return bool True if coupon was applied, false otherwise.
     */
    private function _auto_apply_single_coupon( $coupon, $discounts ) {
        if ( ! $this->_validate_auto_apply_coupon( $coupon ) ) {
            return false;
        }

        // check if coupon is valid.
        $check = $discounts->is_coupon_valid( $coupon );

        if ( is_wp_error( $check ) ) {
            do_action( 'acfw_auto_apply_coupon_invalid', $coupon, $check );
            return false;
        }

        // clear notices for previous coupons in loop if current coupon is individual use (prevent multiple coupon applied notices).
        if ( $coupon->get_individual_use() ) {
            wc_clear_notices();
        }

        // apply the coupon.
        return $this->add_coupon_to_cart( $coupon );
    }

    /**
     * Add coupon to cart.
     * Optimized so WC won't need to create a new WC_Coupon object when trying to apply the coupon.
     *
     * @since 2.6
     * @since 3.3 Make function public.
     * @access public
     *
     * @param Advanced_Coupon $coupon Coupon object.
     * @return bool True if applied, false otherwise.
     */
    public function add_coupon_to_cart( $coupon ) {
        if ( \WC()->cart->has_discount( $coupon->get_code() ) ) {
            return false;
        }

        $applied_coupons   = \WC()->cart->get_applied_coupons();
        $applied_coupons[] = $coupon->get_code();

        \WC()->cart->set_applied_coupons( $applied_coupons );

        // add success apply coupon notice.
        if ( ! apply_filters( 'acfw_hide_auto_apply_coupon_success_notice', false, $coupon ) ) {
            $coupon->add_coupon_message( 200 );
        }

        // run hooks after coupon is applied.
        do_action( 'woocommerce_applied_coupon', $coupon );

        return true;
    }

    /**
     * Validate coupon for auto apply.
     *
     * @since 2.0
     * @access private
     *
     * @param WC_Coupon $coupon WooCommerce coupon object.
     * @return bool True if valid, false otherwise.
     */
    private function _validate_auto_apply_coupon( $coupon ) {
        if ( ! $coupon->get_id() || get_post_status( $coupon->get_id() ) !== 'publish' ) {
            return false;
        }

        // ACFWP-160 disable auto apply for coupons with usage limits.
        if ( $coupon->get_usage_limit() || $coupon->get_usage_limit_per_user() ) {
            return false;
        }

        // disable auto apply for coupons that has value for allowed emails meta.
        $allowed_emails = $coupon->get_meta( 'customer_email', true );
        if ( is_array( $allowed_emails ) && ! empty( $allowed_emails ) ) {
            return false;
        }

        return true;
    }

    /**
     * Implement auto apply coupons.
     *
     * @since 2.0
     * @since 2.4.2 Add individual use condition.
     * @since 4.0.5 Enhanced individual use coupon validation with case-insensitive comparison.
     * @access public
     */
    public function implement_auto_apply_coupons() {
        // Disable hide coupon field in cart filter so it won't prevent auto apply.
        remove_filter( 'woocommerce_coupons_enabled', array( \ACFWF()->URL_Coupons, 'hide_coupon_fields' ) );

        $auto_coupons = apply_filters( 'acfwp_auto_apply_coupons', get_option( $this->_constants->AUTO_APPLY_COUPONS, array() ) );
        $auto_coupons = $this->_filter_auto_apply_coupons_allowed_from_applied_individual_use_coupons( $auto_coupons );
        $applied      = array();

        $individual_use_coupon_applied  = false;
        $individual_use_allowed_coupons = array();

        /**
         * Hook to run before auto apply coupons.
         *
         * @since 4.0.4
         *
         * @param array $auto_coupons List of auto apply coupon IDs.
         */
        do_action( 'acfwp_before_auto_apply_coupons', $auto_coupons );

        // only run when there are coupons to be auto applied and when cart has no individual use coupons already applied.
        if ( is_array( $auto_coupons ) && ! empty( $auto_coupons ) ) {

            $discounts = new \WC_Discounts( \WC()->cart );
            foreach ( $auto_coupons as $coupon_id ) {

                if ( get_post_type( $coupon_id ) !== 'shop_coupon' ) {
                    continue;
                }

                $coupon      = new Advanced_Coupon( $coupon_id );
                $coupon_code = $coupon->get_code();

                // skip if coupon already applied.
                if ( in_array( $coupon->get_code(), \WC()->cart->get_applied_coupons(), true ) ) {
                    continue;
                }

                // Auto-apply the coupon.
                $checked = $this->_auto_apply_single_coupon( $coupon, $discounts );

                /**
                 * If an individual-use coupon was already applied,
                 * only allow other coupons that are explicitly allowed alongside it.
                 *
                 * NOTE:
                 * - we need to place this condition after $checked because we need to do invalid coupon check.
                 * - e.g (Cart Conditions: will not be checked if this condition is applied before $checked)
                */
                if ( $checked && $individual_use_coupon_applied ) {
                    $allowed_norm = array_map( 'wc_format_coupon_code', (array) $individual_use_allowed_coupons );
                    if ( ! in_array( wc_format_coupon_code( $coupon_code ), $allowed_norm, true ) ) {
                        $checked = false;
                    }
                }

                /**
                 * Skip coupon if it's for individual use but there's already another coupon applied on cart.
                 *
                 * NOTE:
                 * - we need to place this condition after $checked because we need to do invalid coupon check.
                 * - e.g (Cart Conditions: will not be checked if this condition is applied before $checked)
                 */
                if ( $checked && $coupon->get_individual_use() ) {
                    // Check if there are already applied coupons that are not allowed by this individual-use coupon.
                    $allowed_coupons = array_map(
                        'wc_get_coupon_code_by_id',
                        ACFWP()->Allowed_Coupons->get_individual_use_coupon_allowed_coupons( $coupon )
                    );
                    $allowed_norm    = array_map( 'wc_format_coupon_code', $allowed_coupons );
                    $applied_norm    = array_map( 'wc_format_coupon_code', (array) \WC()->cart->get_applied_coupons() );
                    $diff_norm       = array_diff( $applied_norm, $allowed_norm );

                    if ( ! empty( $diff_norm ) ) {
                        $checked = false;
                    }

                    // No conflict, mark this individual-use coupon as applied.
                    $individual_use_coupon_applied  = true;
                    $individual_use_allowed_coupons = $allowed_coupons;
                }

                // Add coupon to applied coupons list if it's valid.
                if ( $checked ) {
                    $applied[] = $coupon->get_code();
                }
            }
        }

        // Re-enable hide coupon field in cart filter so it won't prevent auto apply.
        add_filter( 'woocommerce_coupons_enabled', array( \ACFWF()->URL_Coupons, 'hide_coupon_fields' ) );

        /**
         * Hook to run after auto apply coupons.
         *
         * @since 4.0.4
         *
         * @param array $auto_coupons List of auto apply coupon IDs.
         */
        do_action( 'acfwp_after_auto_apply_coupons', $applied, $auto_coupons );
    }

    /**
     * Filter the auto apply coupons to only list out coupons that are allowed for "individual use" coupons that are already applied in the cart.
     *
     * @since 3.6.2
     * @access private
     *
     * @param array $auto_coupons List of auto apply coupon IDs.
     * @return array Filtered list of auto apply coupon IDs.
     */
    private function _filter_auto_apply_coupons_allowed_from_applied_individual_use_coupons( $auto_coupons ) {
        // Skip if cart has no applied coupons.
        if ( empty( \WC()->cart->get_applied_coupons() ) ) {
            return $auto_coupons;
        }

        $auto_coupons_to_keep = $auto_coupons;
        $has_individual_use   = false;
        $applied_coupons      = array();

        // Check if cart has individual use coupons and filter auto apply coupons when they're not allowed.
        foreach ( \WC()->cart->get_coupons() as $coupon ) {
            $applied_coupons[] = $coupon->get_id();

            if ( $coupon->get_individual_use() ) {
                $has_individual_use   = true;
                $allowed_coupons      = ACFWP()->Allowed_Coupons->get_individual_use_coupon_allowed_coupons( $coupon );
                $auto_coupons_to_keep = array_intersect( $auto_coupons, $allowed_coupons );
            }
        }

        // Remove coupon from auto apply list if the already applied coupons is not allowed for it when it's individual use.
        foreach ( $auto_coupons_to_keep as $coupon_id ) {
            $coupon = new \WC_Coupon( $coupon_id );
            if ( $coupon->get_individual_use() ) {
                $allowed_coupons = ACFWP()->Allowed_Coupons->get_individual_use_coupon_allowed_coupons( $coupon );
                $intersect       = array_intersect( $allowed_coupons, $applied_coupons );

                if ( empty( $intersect ) ) {
                    $auto_coupons_to_keep = array_diff( $auto_coupons_to_keep, array( $coupon_id ) );
                }
            }
        }

        return $has_individual_use ? array_unique( $auto_coupons_to_keep ) : $auto_coupons;
    }

    /**
     * Check if cart already has an individual coupon use applied.
     *
     * @since 2.4.2
     * @access private
     */
    private function _does_cart_have_individual_use_coupon() {
        foreach ( \WC()->cart->get_applied_coupons() as $code ) {
            $coupon = new \WC_Coupon( $code );
            if ( $coupon->get_individual_use() ) {
                return true;
            }
}

        return false;
    }

    /**
     * Force create session when cart is empty and there are coupons to be auto applied.
     *
     * @since 2.4
     * @access public
     */
    public function force_create_cart_session() {
        // function should only run on either cart or checkout pages.
        if ( ! is_cart() && ! is_checkout() ) {
            return;
        }

        $auto_coupons = get_option( $this->_constants->AUTO_APPLY_COUPONS, array() );

        // create session.
        if ( \WC()->cart->is_empty() && is_array( $auto_coupons ) && ! empty( $auto_coupons ) ) {
            \WC()->session->set_customer_session_cookie( true );
        }
    }

    /**
     * Hide the "remove coupon" link in cart totals table for auto applied coupons.
     *
     * @since 2.0
     * @access public
     *
     * @param string    $coupon_html WC coupon cart total table row html markup.
     * @param WC_Coupon $coupon      Current coupon loaded WC_Coupon object.
     * @return string Filtered WC coupon cart total table row html markup.
     */
    public function hide_remove_coupon_link_in_cart_totals( $coupon_html, $coupon ) {
        if ( ! $this->_validate_auto_apply_coupon( $coupon ) ) {
            return $coupon_html;
        }

        $auto_coupons = get_option( $this->_constants->AUTO_APPLY_COUPONS, array() );

        if ( is_array( $auto_coupons ) && ! empty( $auto_coupons ) && in_array( $coupon->get_id(), $auto_coupons, true ) ) {
            $coupon_html = preg_replace( '#<a.*?>.*?</a>#i', '', $coupon_html );
        }

        return $coupon_html;
    }

    /**
     * Clear auto apply cache.
     *
     * @since 2.0
     */
    private function _clear_auto_apply_cache() {
        update_option( $this->_constants->AUTO_APPLY_COUPONS, array() );
    }

    /**
     *  Rebuild auto apply cache.
     *
     * @since 2.0
     * @return array List of auto apply coupon ids.
     */
    private function _rebuild_auto_apply_cache() {
        $auto_coupons = get_option( $this->_constants->AUTO_APPLY_COUPONS, array() );
        $verified     = array_filter(
            $auto_coupons,
            function ( $c ) {
            return get_post_type( $c ) === 'shop_coupon' && get_post_status( $c ) === 'publish';
            }
        );

        update_option( $this->_constants->AUTO_APPLY_COUPONS, array_unique( $verified ) );
        return $verified;
    }

    /**
     * Render clear auto apply cache settings field.
     *
     * @since 2.0
     * @access public
     *
     * @param array $value Field value data.
     */
    public function render_rebuild_auto_apply_cache_setting_field( $value ) {
        $spinner_image = $this->_constants->IMAGES_ROOT_URL . 'spinner.gif';

        include $this->_constants->VIEWS_ROOT_PATH . 'settings' . DIRECTORY_SEPARATOR . 'view-render-rebuild-auto-apply-cache-settting-field.php';
    }

    /**
     * AJAX rebuild auto apply cache.
     *
     * @since 2.0
     * @access public
     */
    public function ajax_rebuild_auto_apply_cache() {
        $nonce = sanitize_key( $_POST['nonce'] ?? '' );
        if ( ! defined( 'DOING_AJAX' ) || ! DOING_AJAX ) {
            $response = array(
                'status'    => 'fail',
                'error_msg' => __( 'Invalid AJAX call', 'advanced-coupons-for-woocommerce' ),
            );
        } elseif ( ! $nonce || ! wp_verify_nonce( $nonce, 'acfw_rebuild_auto_apply_cache' ) || ! current_user_can( 'manage_woocommerce' ) ) {
            $response = array(
                'status'    => 'fail',
                'error_msg' => __( 'You are not allowed to do this', 'advanced-coupons-for-woocommerce' ),
            );
        } else {

            $type = isset( $_POST['type'] ) ? sanitize_text_field( wp_unslash( $_POST['type'] ) ) : '';
            if ( 'clear' === $type ) {

                $this->_clear_auto_apply_cache();
                $response = array(
                    'status'  => 'success',
                    'message' => __( 'Auto apply coupons cache have been cleared successfully.', 'advanced-coupons-for-woocommerce' ),
                );

            } else {

                $verified = $this->_rebuild_auto_apply_cache();
                $response = array(
                    'status'  => 'success',
                    'message' => sprintf(
                        /* Translators: %s: Count of validated auto apply coupons. */
                        __( 'Auto apply coupons cache has been rebuilt successfully. %s coupon(s) have been validated.', 'advanced-coupons-for-woocommerce' ),
                        count( $verified )
                    ),
                );
            }
        }

        @header( 'Content-Type: application/json; charset=' . get_option( 'blog_charset' ) ); // phpcs:ignore
        echo wp_json_encode( $response );
        wp_die();
    }

    /**
     * Remove all auto applied coupons from the cart.
     *
     * @since 3.4.1
     * @access public
     */
    public function remove_auto_applied_coupons_from_cart() {
        // Skip if Auto Apply module is disabled. This check is needed as this can be run outside on other modules.
        if ( ! \ACFWF()->Helper_Functions->is_module( Plugin_Constants::AUTO_APPLY_MODULE ) ) {
            return;
        }

        $auto_coupon_ids = apply_filters( 'acfwp_auto_apply_coupons', get_option( $this->_constants->AUTO_APPLY_COUPONS, array() ) );

        // skip if there are no auto apply coupons.
        if ( empty( $auto_coupon_ids ) ) {
            return;
        }

        // get coupon code for all auto applied coupon IDs.
        $auto_coupons = array_map(
            function ( $id ) {
            $coupon = new \WC_Coupon( $id );
            return $coupon->get_code();
            },
            $auto_coupon_ids
        );

        // remove auto apply coupon codes from applied coupons list.
        $applied_coupons = array_diff( \WC()->cart->get_applied_coupons(), $auto_coupons );

        // update applied coupons list in cart.
        \WC()->cart->set_applied_coupons( $applied_coupons );
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
     * @implements ACFWP\Interfaces\Initiable_Interface
     */
    public function initialize() {
        add_action( 'wp_ajax_acfw_rebuild_auto_apply_cache', array( $this, 'ajax_rebuild_auto_apply_cache' ) );
    }

    /**
     * Execute Auto_Apply class.
     *
     * @since 2.0
     * @access public
     * @inherit ACFWP\Interfaces\Model_Interface
     */
    public function run() {
        add_action( 'woocommerce_admin_field_acfw_rebuild_auto_apply_cache', array( $this, 'render_rebuild_auto_apply_cache_setting_field' ) );

        if ( ! \ACFWF()->Helper_Functions->is_module( Plugin_Constants::AUTO_APPLY_MODULE ) ) {
            return;
        }

        add_action( 'wp', array( $this, 'force_create_cart_session' ) );
        add_action( 'woocommerce_after_calculate_totals', array( $this, 'implement_auto_apply_coupons' ) );
        add_filter( 'woocommerce_cart_totals_coupon_html', array( $this, 'hide_remove_coupon_link_in_cart_totals' ), 10, 2 );
    }
}
