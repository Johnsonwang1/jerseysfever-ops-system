<?php
namespace ACFWP\Models;

use ACFWP\Abstracts\Abstract_Main_Plugin_Class;
use ACFWP\Abstracts\Base_Model;
use ACFWP\Helpers\Helper_Functions;
use ACFWP\Helpers\Plugin_Constants;
use ACFWP\Interfaces\Model_Interface;
use ACFWP\Models\Objects\Vite_App;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}


/**
 * Model that houses the logic of loading plugin scripts.
 * Private Model.
 *
 * @since 2.0
 */
class Script_Loader extends Base_Model implements Model_Interface {
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
    }

    /*
    |--------------------------------------------------------------------------
    | Backend
    |--------------------------------------------------------------------------
     */

    /**
     * Register backend styles.
     *
     * @since 2.0
     * @access public
     *
     * @param array $styles Styles list.
     * @return array Filtered styles list.
     */
    public function register_backend_styles( $styles ) {
        $styles['acfw-reports'] = array(
            'src'   => $this->_constants->JS_ROOT_URL . 'apps/acfw-reports/dist/acfw-reports.css',
            'deps'  => array(),
            'ver'   => $this->_constants->VERSION,
            'media' => 'all',
        );

        return $styles;
    }

    /**
     * Register backend scripts.
     *
     * @since 2.0
     * @access public
     *
     * @param array $scripts Styles list.
     * @return array Filtered styles list.
     */
    public function register_backend_scripts( $scripts ) {
        $scripts['acfw-reports'] = array(
            'src'    => $this->_constants->JS_ROOT_URL . 'apps/acfw-reports/dist/acfw-reports.js',
            'deps'   => array(),
            'ver'    => $this->_constants->VERSION,
            'footer' => true,
        );

        return $scripts;
    }

    /**
     * Load backend js and css scripts.
     *
     * @since 2.0
     * @access public
     *
     * @param WP_Screen $screen    Current screen object.
     * @param string    $post_type Current screen post type.
     */
    public function load_backend_scripts( $screen, $post_type ) {

        do_action( 'acfwp_before_load_backend_scripts', $screen, $post_type );

        /**
         * Enqueue script for edit coupon page.
         */
        if ( 'post' === $screen->base && 'shop_coupon' === $screen->id && 'shop_coupon' === $post_type ) {

            $edit_coupon_vite = new Vite_App(
                'acfwp-edit-advanced-coupon',
                'packages/acfwp-edit-advanced-coupon/index.ts',
                array( 'jquery-ui-core', 'jquery-ui-datepicker' ),
            );
            $edit_coupon_vite->enqueue();

            $edit_coupon_app_vite = new Vite_App(
                'acfwp-edit-coupon-app',
                'packages/acfwp-edit-coupon-app/index.tsx',
                array( 'wc-admin-app', 'wp-api' ),
            );
            $edit_coupon_app_vite->enqueue();
        }

        // reports.
        if ( 'woocommerce_page_wc-reports' === $screen->base && isset( $_GET['tab'] ) && 'acfw_reports' === $_GET['tab'] ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended

            wp_enqueue_style( 'acfw-reports' );
            wp_enqueue_script( 'acfw-reports' );
            wp_localize_script(
                'acfw-reports',
                'acfw_reports',
                apply_filters(
                    'acfw_reports_js_localize',
                    array(
                        'admin_url'          => admin_url(),
                        'i18n_no_orders_row' => __( 'No orders found', 'advanced-coupons-for-woocommerce' ),
                        'i18n_previous'      => __( '« Previous', 'advanced-coupons-for-woocommerce' ),
                        'i18n_next'          => __( 'Next »', 'advanced-coupons-for-woocommerce' ),
                    )
                )
            );

        }

        do_action( 'acfwp_after_load_backend_scripts', $screen, $post_type );
    }

    /**
     * Filter edit advanced coupon JS localized data.
     *
     * @since 2.0
     * @access public
     *
     * @param array $data Localized data.
     * @return array Filtered localized data.
     */
    public function filter_edit_advanced_coupon_localized_data( $data ) {
        $data['coupon_sort_invalid']             = __( 'Please set a valid custom sort value.', 'advanced-coupons-for-woocommerce' );
        $data['repeat_incompatible_notice']      = __( 'Repeat deals are not yet supported using this combination of Trigger and Apply types. ', 'advanced-coupons-for-woocommerce' );
        $data['condition_exists_field_option']   = array(
            'exists'   => __( 'EXISTS', 'advanced-coupons-for-woocommerce' ),
            'notexist' => __( "DOESN'T EXIST", 'advanced-coupons-for-woocommerce' ),
        );
        $data['condition_contains_field_option'] = array(
            'contains' => __( 'CONTAINS', 'advanced-coupons-for-woocommerce' ),
        );
        $data['cashback_coupon']                 = array(
            'cashback_percentage_label' => __( 'Cashback percentage', 'advanced-coupons-for-woocommerce' ),
            'cashback_amount_label'     => __( 'Cashback amount', 'advanced-coupons-for-woocommerce' ),
        );

        return $data;
    }

    /*
    |--------------------------------------------------------------------------
    | Frontend
    |--------------------------------------------------------------------------
     */

    /**
     * Load frontend js and css scripts.
     *
     * @since 2.0
     * @access public
     */
    public function load_frontend_scripts() {
        global $post, $wp, $wp_query;

        // Load cart js and css.
        if ( is_cart() || is_checkout() ) {
            $cart_vite = new Vite_App(
                'acfwp-cart',
                'packages/acfwp-cart/index.ts',
                array( 'jquery', 'wc-cart' ),
            );
            $cart_vite->enqueue();
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Admin App
    |--------------------------------------------------------------------------
     */

    /**
     * Enqueue admin app scripts.
     *
     * @since 2.2
     * @access public
     */
    public function enqueue_admin_app_scripts() {
        $admin_app_vite = new Vite_App(
            'acfwp_admin_app',
            'packages/acfwp-admin-app/index.tsx',
            array(),
            array( 'acfwf-admin-app' ),
        );
        $admin_app_vite->enqueue();
    }

    /**
     * Admin app localized data.
     *
     * @since 2.2
     * @access public
     *
     * @param array $data Localized data object.
     */
    public function admin_app_localized_data( $data ) {
        /**
         * START: License Page.
         */
        $data['license_page']['indicator'] = array(
            'active'   => __( 'License is Active', 'advanced-coupons-for-woocommerce' ),
            'inactive' => __( 'Not Activated Yet', 'advanced-coupons-for-woocommerce' ),
        );

        $data['license_page']['premium_content'] = array(
            'title' => __( 'Premium Version', 'advanced-coupons-for-woocommerce' ),
            'text'  => __( 'You are currently using Advanced Coupons for WooCommerce Premium version. The premium version gives you a massive range of extra extra features for your WooCommerce coupons so you can promote your store better. As the Premium version functions like an add-on, you must have Advanced Coupons for WooCommerce Free installed and activated along with WooCommerce (which is required for both).', 'advanced-coupons-for-woocommerce' ),
        );

        $data['license_page']['specs'] = array(
            array(
                'label' => __( 'Plan', 'advanced-coupons-for-woocommerce' ),
                'value' => __( 'Premium Version', 'advanced-coupons-for-woocommerce' ),
            ),
            array(
                'label' => __( 'Version', 'advanced-coupons-for-woocommerce' ),
                'value' => $this->_constants->VERSION,
            ),
        );

        $data['license_page']['formlabels'] = array(
            'license_key' => __( 'License Key:', 'advanced-coupons-for-woocommerce' ),
            'email'       => __( 'Activation Email:', 'advanced-coupons-for-woocommerce' ),
            'button'      => __( 'Activate Key', 'advanced-coupons-for-woocommerce' ),
            'help'        => array(
                'text'  => __( 'Can’t find your key?', 'advanced-coupons-for-woocommerce' ),
                'link'  => 'https://advancedcouponsplugin.com/my-account/?utm_source=acfwp&utm_medium=license&utm_campaign=findkey',
                'login' => __( 'Login to your account', 'advanced-coupons-for-woocommerce' ),
            ),
        );

        $data['license_page']['spinner_img'] = $this->_constants->IMAGES_ROOT_URL . 'spinner-2x.gif';
        $data['license_page']['_formNonce']  = wp_create_nonce( 'acfw_activate_license' );
        /**
         * END: License Page.
         */

        /**
         * START: Help Page.
         */

        $utility_cards = array();

        // rebuild/clear auto apply cache tool.
        if ( \ACFWF()->Helper_Functions->is_module( Plugin_Constants::AUTO_APPLY_MODULE ) ) {

            $utility_cards[] = array(
                'title'   => __( 'Rebuild/Clear Auto Apply Coupons Cache', 'advanced-coupons-for-woocommerce' ),
                'desc'    => __( 'Manually rebuild and validate all auto apply coupons within the cache or clear the cache entirely.', 'advanced-coupons-for-woocommerce' ),
                'id'      => 'acfw_rebuild_auto_apply_cache',
                'nonce'   => wp_create_nonce( 'acfw_rebuild_auto_apply_cache' ),
                'buttons' => array(
                    array(
                        'text'   => __( 'Rebuild cache', 'advanced-coupons-for-woocommerce' ),
                        'action' => 'rebuild',
                        'type'   => 'primary',
                    ),
                    array(
                        'text'   => __( 'Clear cache', 'advanced-coupons-for-woocommerce' ),
                        'action' => 'clear',
                        'type'   => 'ghost',
                    ),
                ),
            );
        }

        // rebuild/clear apply notification cache tool.
        if ( \ACFWF()->Helper_Functions->is_module( Plugin_Constants::APPLY_NOTIFICATION_MODULE ) ) {

            $utility_cards[] = array(
                'title'   => __( 'Rebuild/Clear Apply Notification Coupons Cache', 'advanced-coupons-for-woocommerce' ),
                'desc'    => __( 'Manually rebuild and validate all apply notification coupons within the cache or clear the cache entirely.', 'advanced-coupons-for-woocommerce' ),
                'id'      => 'acfw_rebuild_apply_notification_cache',
                'nonce'   => wp_create_nonce( 'acfw_rebuild_apply_notification_cache' ),
                'buttons' => array(
                    array(
                        'text'   => __( 'Rebuild cache', 'advanced-coupons-for-woocommerce' ),
                        'action' => 'rebuild',
                        'type'   => 'primary',
                    ),
                    array(
                        'text'   => __( 'Clear cache', 'advanced-coupons-for-woocommerce' ),
                        'action' => 'clear',
                        'type'   => 'ghost',
                    ),
                ),
            );
        }

        // trigger usage limits reset cron tool.
        if ( \ACFWF()->Helper_Functions->is_module( Plugin_Constants::USAGE_LIMITS_MODULE ) ) {

            $utility_cards[] = array(
                'title'   => __( 'Reset coupons usage limit', 'advanced-coupons-for-woocommerce' ),
                'desc'    => __( 'Manually run cron for resetting usage limit for all applicable coupons.', 'advanced-coupons-for-woocommerce' ),
                'id'      => 'acfw_reset_coupon_usage_limit',
                'nonce'   => wp_create_nonce( 'acfw_reset_coupon_usage_limit' ),
                'buttons' => array(
                    array(
                        'text'   => __( 'Trigger reset cron', 'advanced-coupons-for-woocommerce' ),
                        'action' => 'reset',
                        'type'   => 'primary',
                    ),
                ),
            );
        }

        // only display this on the main site for multi install. This will also always display for non-multi install.
        if ( is_main_site() ) {
            $utility_cards[] = array(
                'title'   => __( 'Refetch Plugin Update Data', 'advanced-coupons-for-woocommerce' ),
                'desc'    => __( 'This will refetch the plugin update data. Useful for debugging failed plugin update operations.', 'advanced-coupons-for-woocommerce' ),
                'id'      => 'acfwp_slmw_refetch_update_data',
                'nonce'   => wp_create_nonce( 'acfwp_slmw_refetch_update_data' ),
                'buttons' => array(
                    array(
                        'text'   => __( 'Refetch Update Data', 'advanced-coupons-for-woocommerce' ),
                        'action' => 'clear',
                        'type'   => 'primary',
                    ),
                ),
            );

            $utility_cards[] = array(
                'title'   => __( 'Check license status', 'advanced-coupons-for-woocommerce' ),
                'desc'    => __( 'Check the current status of your Advanced Coupons premium license.', 'advanced-coupons-for-woocommerce' ),
                'id'      => 'acfw_refresh_license_status',
                'nonce'   => wp_create_nonce( 'acfw_refresh_license_status' ),
                'buttons' => array(
                    array(
                        'text'   => __( 'Check License Status', 'advanced-coupons-for-woocommerce' ),
                        'action' => 'refresh',
                        'type'   => 'primary',
                    ),
                ),
            );
        }

        // register utility section data.
        if ( ! empty( $utility_cards ) ) {

            $data['help_page']['utilities'] = array(
                'title' => __( 'Utilities', 'advanced-coupons-for-woocommerce' ),
                'cards' => $utility_cards,
            );
        }

        /**
         * END: Help Page.
         */

        return $data;
    }

    /*
    |--------------------------------------------------------------------------
    | Fulfill implemented interface contracts
    |--------------------------------------------------------------------------
     */

    /**
     * Execute plugin script loader.
     *
     * @since 2.0
     * @access public
     * @implements ACFWP\Interfaces\Model_Interface
     */
    public function run() {
        add_filter( 'acfw_register_backend_styles', array( $this, 'register_backend_styles' ) );
        add_filter( 'acfw_register_backend_scripts', array( $this, 'register_backend_scripts' ) );
        add_filter( 'acfw_edit_advanced_coupon_localize', array( $this, 'filter_edit_advanced_coupon_localized_data' ) );
        add_action( 'acfw_after_load_backend_scripts', array( $this, 'load_backend_scripts' ), 10, 2 );
        add_action( 'wp_enqueue_scripts', array( $this, 'load_frontend_scripts' ) );

        add_action( 'acfw_admin_app_enqueue_scripts_before', array( $this, 'enqueue_admin_app_scripts' ) );
        add_filter( 'acfwf_admin_app_localized', array( $this, 'admin_app_localized_data' ) );
    }
}
