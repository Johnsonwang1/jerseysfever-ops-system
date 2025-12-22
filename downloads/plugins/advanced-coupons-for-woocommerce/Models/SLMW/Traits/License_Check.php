<?php
namespace ACFWP\Models\SLMW\Traits;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Trait that holds the logic for license check.
 *
 * @since 3.6.0
 */
trait License_Check {

    /**
     * Initialize the last license check value during plugin activation.
     *
     * @since 3.6.0
     * @access private
     */
    private function _init_last_license_check_value() {
        $last_check = get_site_option( $this->_constants->OPTION_LAST_LICENSE_CHECK, 0 );

        // only update the last license check value if it's not set.
        if ( ! $last_check ) {
            get_site_option( $this->_constants->OPTION_LAST_LICENSE_CHECK, time() );
        }
    }

    /**
     * Check Advanced Coupons premium license.
     *
     * @since 3.6.0
     * @access public
     *
     * @param bool $force Whether to force the license check (force is still limited to once per minute).
     * @return array|\WP_Error License data on success, error object on failure.
     */
    public function check_license( $force = false ) {
        // License validation bypassed - always return active license.
        update_site_option( $this->_constants->OPTION_LICENSE_ACTIVATED, 'yes' );
        update_site_option( $this->_constants->OPTION_LAST_LICENSE_CHECK, time() );
        delete_site_option( $this->_constants->OPTION_LICENSE_EXPIRED );

        $license_data = array(
            $this->_constants->SOFTWARE_KEY => array(
                'status'               => 'success',
                'license_status'       => 'active',
                'subscription_status'  => 'active',
                'expiration_timestamp' => date( 'Y-m-d H:i:s', strtotime( '+10 years' ) ),
            ),
        );

        return $license_data;
    }

    /**
     * Schedule license check.
     *
     * @since 3.6.0
     * @access private
     */
    private function _schedule_license_check() {
        // Skip if the license check is already scheduled.
        if ( \WC()->queue()->get_next( 'acfw_license_check', array(), 'acfw_license_check' ) instanceof \WC_DateTime ) {
            return;
        }

        // Schedule license check, randomize the time in a day to avoid multiple sites checking at the same time.
        \WC()->queue()->schedule_recurring(
            time() + wp_rand( 0, DAY_IN_SECONDS ),
            DAY_IN_SECONDS,
            'acfw_license_check',
            array(),
            'acfw_license_check'
        );
    }

    /**
     * AJAX refresh license status.
     *
     * @since 3.6.0
     * @access public
     */
    public function ajax_refresh_license_status() {
        $post_data = $this->_helper_functions->validate_ajax_request(
            array(
                'nonce_value_key' => 'nonce',
                'nonce_action'    => 'acfw_refresh_license_status',
                'user_capability' => 'manage_woocommerce',
            )
        );

        // Skip if the AJAX request is not valid.
        if ( is_wp_error( $post_data ) ) {
            wp_send_json(
                array(
                    'status'  => 'fail',
                    'message' => $post_data->get_error_message(),
                )
            );
        }

        // Check the license data.
        $license_data = $this->check_license( true );

        // Skip if the license check failed.
        if ( is_wp_error( $license_data ) ) {
            wp_send_json(
                array(
                    'status'  => 'fail',
                    'message' => $license_data->get_error_message(),
                )
            );
        }

        wp_send_json(
            $license_data['ACFW'] ?? array(
                'status'  => 'fail',
                'message' => __( 'Missing plugin license data.', 'advanced-coupons-for-woocommerce' ),
            )
        );
    }
}
