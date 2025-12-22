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
 * Model that houses the logic of extending the coupon system of woocommerce.
 * It houses the logic of handling coupon url.
 * Public Model.
 *
 * @since 2.0
 */
class Apply_Notification extends Base_Model implements Model_Interface, Initiable_Interface {
    /*
    |--------------------------------------------------------------------------
    | Class Properties
    |--------------------------------------------------------------------------
     */

    /**
     * Property that houses the flag value to determine if the implementation has already run or not.
     *
     * @since 3.5.5
     * @access private
     * @var bool
     */
    private $_implementation_run = false;

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
    | One click appy notification implementation
    |--------------------------------------------------------------------------
     */

    /**
     * Get one click apply notices.
     *
     * @since 3.5.9
     * @access public
     *
     * @return array|null Notices data or null if condition is not satisfied.
     */
    public function get_one_click_apply_notices() {
        $apply_notifications = apply_filters( 'acfwp_apply_notification_coupons', \ACFWF()->Helper_Functions->get_option( $this->_constants->APPLY_NOTIFICATION_CACHE, array() ) );

        if ( ! is_array( $apply_notifications ) || empty( $apply_notifications ) ) {
            return;
        }

        $discounts = new \WC_Discounts( \WC()->cart );
        $notices   = array();
        foreach ( $apply_notifications as $coupon_id ) {
            if ( get_post_type( $coupon_id ) !== 'shop_coupon' ) {
                continue;
            }

            $coupon = new Advanced_Coupon( $coupon_id );
            $code   = $coupon->get_code();

            // if coupon is already applied or returns a WP_Error object, then don't proceed.
            if ( in_array( $code, \WC()->cart->get_applied_coupons(), true ) || get_post_status( $coupon_id ) !== 'publish' || is_wp_error( $discounts->is_coupon_valid( $coupon ) ) ) {
                continue;
            }

            $message     = $coupon->get_advanced_prop( 'apply_notification_message', __( 'Your current cart is eligible for a coupon.', 'advanced-coupons-for-woocommerce' ) );
            $button      = '<button type="button" class="acfw_apply_notification button" value="' . esc_attr( $code ) . '">' . $coupon->get_advanced_prop( 'apply_notification_btn_text', __( 'Apply Coupon', 'advanced-coupons-for-woocommerce' ) ) . '</button>';
            $notice_type = $coupon->get_advanced_prop( 'apply_notification_type', 'notice' );

            // it's necessary to change notice type to 'info' if we are on cart/checkout block, because wc notice block can't handle 'notice' type.
            if ( ( $this->_helper_functions->is_store_api_request() || $this->_helper_functions->is_cart_block() ) && 'notice' === $notice_type ) {
                $notice_type = 'info';
            }

            $notices[] = array(
                'message' => $message . $button,
                'type'    => $notice_type,
            );
        }

        return $notices;
    }

    /**
     * Implement apply notifications.
     *
     * @since 2.0
     * @since 3.2.1 improve checkout page check condition logic. prevent to run implementation more than once.
     * @since 3.4.1 change hook priorirty from 20 to 2000. this is due to a conflict with a third party plugin (see issue-#474).
     * @since 3.5.9 implement apply notifications on cart/checkout classic page.
     * @access public
     */
    public function implement_apply_notifications() {

        // Skip if implementation has already run and not doing on cart/checkout block.
        if ( $this->_implementation_run ) {
            return;
        }

        // skip if we are not on cart page, or not doing cart/checkout calculations ajax and not on cart/checkout block.
        if ( ! ( is_cart() && ! isset( $_GET['wc-ajax'] ) ) && ! ( isset( $_GET['wc-ajax'] ) && 'update_order_review' === $_GET['wc-ajax'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
            return;
        }

        $notices = $this->get_one_click_apply_notices();

        if ( ! is_array( $notices ) || empty( $notices ) ) {
            return;
        }

        foreach ( $notices as $notice ) {
            wc_add_notice( $notice['message'], $notice['type'] );
        }

        $this->_implementation_run = true;
    }

    /*
    |--------------------------------------------------------------------------
    | Clear notification cache methods
    |--------------------------------------------------------------------------
     */

    /**
     * Clear auto apply cache.
     *
     * @since 2.0
     */
    private function _clear_apply_notification_cache() {
        update_option( $this->_constants->APPLY_NOTIFICATION_CACHE, array() );
    }

    /**
     *  Rebuild auto apply cache.
     *
     * @since 2.0
     *
     * @return array $verified List of apply notification coupons.
     */
    private function _rebuild_apply_notification_cache() {
        $apply_notifications = get_option( $this->_constants->APPLY_NOTIFICATION_CACHE, array() );
        $verified            = array_filter(
            $apply_notifications,
            function ( $c ) {
            return get_post_type( $c ) === 'shop_coupon' && get_post_status( $c ) === 'publish';
            }
        );

        update_option( $this->_constants->APPLY_NOTIFICATION_CACHE, array_unique( $verified ) );
        return $verified;
    }

    /**
     * Render clear auto apply cache settings field.
     *
     * @deprecated 3.0.1
     *
     * @since 2.0
     * @access public
     *
     * @param array $value Field value data.
     */
    public function render_rebuild_apply_notification_cache_setting_field( $value ) {
        \wc_deprecated_function( 'Apply_Notification::render_rebuild_apply_notification_cache_setting_field', '3.0.1' );
    }

    /*
    |--------------------------------------------------------------------------
    | AJAX Functions
    |--------------------------------------------------------------------------
     */

    /**
     * AJAX rebuild auto apply cache.
     *
     * @since 2.0
     * @access public
     */
    public function ajax_rebuild_apply_notification_cache() {
        $nonce = sanitize_key( $_POST['nonce'] ?? '' );
        if ( ! defined( 'DOING_AJAX' ) || ! DOING_AJAX ) {
            $response = array(
                'status'    => 'fail',
                'error_msg' => __( 'Invalid AJAX call', 'advanced-coupons-for-woocommerce' ),
            );
        } elseif ( ! $nonce || ! wp_verify_nonce( $nonce, 'acfw_rebuild_apply_notification_cache' ) || ! current_user_can( 'manage_woocommerce' ) ) {
            $response = array(
                'status'    => 'fail',
                'error_msg' => __( 'You are not allowed to do this', 'advanced-coupons-for-woocommerce' ),
            );
        } else {

            $type = sanitize_text_field( wp_unslash( $_POST['type'] ?? '' ) );

            if ( 'clear' === $type ) {

                $this->_clear_apply_notification_cache();
                $response = array(
                    'status'  => 'success',
                    'message' => __( 'Appy notification coupons cache have been cleared successfully.', 'advanced-coupons-for-woocommerce' ),
                );

            } else {

                $verified = $this->_rebuild_apply_notification_cache();
                $response = array(
                    'status'  => 'success',
                    'message' => sprintf(
                        /* Translators: %s: Count of validated one click apply coupons. */
                        __( 'Appy notification coupons cache has been rebuilt successfully. %s coupon(s) have been validated.', 'advanced-coupons-for-woocommerce' ),
                        count( $verified )
                    ),
                );
            }
        }

        @header( 'Content-Type: application/json; charset=' . get_option( 'blog_charset' ) ); // phpcs:ignore
        echo wp_json_encode( $response );
        wp_die();
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
        add_action( 'wp_ajax_acfw_rebuild_apply_notification_cache', array( $this, 'ajax_rebuild_apply_notification_cache' ) );
    }

    /**
     * Execute Apply_Notification class.
     *
     * @since 2.0
     * @access public
     * @inherit ACFWP\Interfaces\Model_Interface
     */
    public function run() {
        if ( ! \ACFWF()->Helper_Functions->is_module( Plugin_Constants::APPLY_NOTIFICATION_MODULE ) ) {
            return;
        }

        add_action( 'woocommerce_after_calculate_totals', array( $this, 'implement_apply_notifications' ), 2000 );
    }
}
