<?php
namespace ACFWP\Models\Third_Party_Integrations;

use ACFWP\Abstracts\Abstract_Main_Plugin_Class;
use ACFWP\Abstracts\Base_Model;
use ACFWP\Helpers\Helper_Functions;
use ACFWP\Helpers\Plugin_Constants;
use ACFWP\Interfaces\Model_Interface;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Model that houses the logic of the FunnelKit module.
 *
 * @since 3.6.1.1
 */
class FunnelKit extends Base_Model implements Model_Interface {
    /*
    |--------------------------------------------------------------------------
    | Class Methods
    |--------------------------------------------------------------------------
     */

    /**
     * Class constructor.
     *
     * @since 3.6.1.1
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

    /**
     * Implement the force apply on funnelkit apply coupon.
     *
     * @since 3.6.1.1
     * @access public
     *
     * @param bool $should_force_apply Should force apply.
     * @return bool Filtered value of should force apply.
     */
    public function implement_force_apply_on_funnelkit_apply_coupon( $should_force_apply ) {
        return did_action( 'wfacp_before_coupon_apply' ) ? true : $should_force_apply;
    }

    /*
    |--------------------------------------------------------------------------
    | Fulfill implemented interface contracts
    |--------------------------------------------------------------------------
     */

    /**
     * Execute FunnelKit class.
     *
     * @since 3.6.1.1
     * @access public
     * @inherit ACFWP\Interfaces\Model_Interface
     */
    public function run() {
        if ( ! $this->_helper_functions->is_plugin_active( 'funnel-builder/funnel-builder.php' ) ) {
            return;
        }

        add_filter( 'acfw_should_force_apply_run', array( $this, 'implement_force_apply_on_funnelkit_apply_coupon' ), 10, 2 );
    }
}
