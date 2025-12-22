<?php
namespace ACFWP\Models\REST_API;

use Automattic\WooCommerce\StoreApi\StoreApi;
use Automattic\WooCommerce\StoreApi\Schemas\ExtendSchema;
use Automattic\WooCommerce\StoreApi\Schemas\V1\CartSchema;

/**
 * WooCommerce Extend Store API for Cart Endpoint.
 *
 * @since 3.5.7
 */
class Store_API_Extend_Endpoint {
    /**
     * Stores Rest Extending instance.
     *
     * @since 3.5.7
     * @var ExtendSchema
     */
    private static $extend;

    /**
     * Plugin Identifier.
     *
     * @since 3.5.7
     * @var string
     */
    const IDENTIFIER = 'acfwp_block';

    /**
     * Bootstraps the class and hooks required data.
     *
     * @since 3.5.7
     * @access public
     */
    public static function init() {
        self::$extend = StoreApi::container()->get( ExtendSchema::class );
        self::extend_store();
    }

    /**
     * Registers the actual data into each endpoint.
     * - To see available endpoints to extend please go to : https://github.com/woocommerce/woocommerce-blocks/blob/trunk/docs/third-party-developers/extensibility/rest-api/available-endpoints-to-extend.md
     *
     * @since 3.5.7
     * @access public
     */
    public static function extend_store() {
        // Register into `cart`.
        if ( is_callable( array( self::$extend, 'register_endpoint_data' ) ) ) {
            self::$extend->register_endpoint_data(
                array(
                    'endpoint'      => CartSchema::IDENTIFIER,
                    'namespace'     => self::IDENTIFIER,
                    'data_callback' => array( 'ACFWP\Models\REST_API\Store_API_Extend_Endpoint', 'extend_data' ),
                    'schema_type'   => ARRAY_A,
                )
            );
        }
    }

    /**
     * Extend endpoint data.
     * - This data will be available in Redux Data Store `cartData.acfwp_block.extension`.
     * - To learn more you can visit : https://github.com/woocommerce/woocommerce-blocks/blob/trunk/docs/third-party-developers/extensibility/rest-api/extend-rest-api-add-data.md
     *
     * @since 3.5.7
     * @access public
     *
     * @return array $item_data Registered data or empty array if condition is not satisfied.
     */
    public static function extend_data() {
        return array(
            'coupons'         => \ACFWP()->Helper_Functions->get_applied_coupon_data(),
            'add_products'    => self::get_cart_items_with_add_product_data(),
            'one_click_apply' => array(
                'notices'          => \ACFWP()->Apply_Notification->get_one_click_apply_notices(),
                /* Translators: %s: coupon code. */
                'on_apply_success' => sprintf( __( 'Coupon code "%s" has been applied to your cart.', 'advanced-coupons-for-woocommerce' ), '{coupon_code}' ),
            ),
        );
    }

    /**
     * Get cart items with add product data.
     *
     * @since 3.5.9
     * @access public
     *
     * @return array Keys of cart items with add product data.
     */
    public static function get_cart_items_with_add_product_data() {
        $items = array_filter(
            \WC()->cart->get_cart_contents(),
            function ( $item ) {
                return isset( $item['acfw_add_product'] );
            }
        );

        return array_column( $items, 'key' );
    }
}
