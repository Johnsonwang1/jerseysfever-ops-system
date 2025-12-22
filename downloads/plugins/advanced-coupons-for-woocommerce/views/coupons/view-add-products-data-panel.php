<?php
// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
    exit;
} ?>

<div id="<?php echo esc_attr( $panel_id ); ?>" class="panel woocommerce_options_panel"
    data-products="<?php echo esc_attr( wp_json_encode( $add_products ) ); ?>"
    data-nonce="<?php echo esc_attr( wp_create_nonce( 'acfw_save_add_products_data' ) ); ?>"
    <?php
    foreach ( $panel_data_atts as $data_key => $data_value ) :
    printf( 'data-%s="%s"', esc_attr( $data_key ), esc_attr( is_array( $data_value ) ? wp_json_encode( $data_value ) : $data_value ) );
endforeach;
?>
>
    <div class="acfw-help-link" data-module="add-products"></div>
    <div class="add-products-block">

        <div class="add-products-info">
            <h3><?php esc_html_e( 'Add Products', 'advanced-coupons-for-woocommerce' ); ?></h3>
            <p><?php esc_html_e( 'This feature lets you add products to a customer’s cart when a coupon is successfully applied. The products listed in the table below will be automatically added to their cart in the specified quantities and price overrides.', 'advanced-coupons-for-woocommerce' ); ?></p>
            <p><?php esc_html_e( "The Add Products feature can also be combined with other features like Cart Conditions and Auto Apply to make products appear in the customer's cart like magic once certain conditions are met.", 'advanced-coupons-for-woocommerce' ); ?></p>
        </div>

        <table class="add-products-data-table acfw-styled-table" data-exclude="<?php echo esc_attr( wp_json_encode( $exclude ) ); ?>">
            <thead>
                <tr>
                    <th class="product"><?php esc_html_e( 'Product', 'advanced-coupons-for-woocommerce' ); ?></th>
                    <th class="quantity"><?php esc_html_e( 'Quantity', 'advanced-coupons-for-woocommerce' ); ?></th>
                    <th class="price"><?php esc_html_e( 'Price/Discount', 'advanced-coupons-for-woocommerce' ); ?></th>
                    <th class="actions"></th>
                </tr>
            </thead>
            <tbody></tbody>
            <tfoot>
                <tr>
                    <td colspan="4">
                        <a class="add-product add-table-row" href="javascript:void(0);">
                            <i class="dashicons dashicons-plus"></i>
                            <?php esc_html_e( 'Add Product', 'advanced-coupons-for-woocommerce' ); ?>
                        </a>
                    </td>
                </tr>
            </tfoot>
        </table>
    </div>

    <div class="add-products-actions-block">
        <button id="save-add-products" class="button-primary" type="button" disabled><?php esc_html_e( 'Save "Add Products" Data', 'advanced-coupons-for-woocommerce' ); ?></button>
        <div class="add-before-cart-condition-check-field">
            <label>
                <input type="checkbox" name="add_before_cart_condition" value="yes" <?php checked( $coupon->get_advanced_prop( 'add_before_conditions' ), true ); ?> />
                <span><?php esc_html_e( 'Add undiscounted products before coupon restrictions & cart conditions.', 'advanced-coupons-for-woocommerce' ); ?></span>
            </label>
        </div>
        <button id="clear-add-products" class="button" type="button"
            data-prompt="<?php esc_attr_e( 'Are you sure you want to do this?', 'advanced-coupons-for-woocommerce' ); ?>"
            data-nonce="<?php echo esc_attr( wp_create_nonce( 'acfw_clear_add_products_data' ) ); ?>"
            <?php echo empty( $add_products ) ? 'disabled' : ''; ?>>
            <?php esc_html_e( 'Clear "Add Products" Data', 'advanced-coupons-for-woocommerce' ); ?>
        </button>
    </div>

    <div class="acfw-overlay" style="background-image:url(<?php echo esc_attr( $spinner_img ); ?>)"></div>
</div>
