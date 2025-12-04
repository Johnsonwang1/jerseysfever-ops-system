<?php
/**
 * 商品图片清理脚本
 * 部署位置: wp-content/mu-plugins/pim-cleanup-images.php
 * 
 * 功能：
 * 1. 删除商品的所有附件图片（数据库记录 + 文件系统）
 * 2. 通过 REST API 调用，需要验证密钥
 * 
 * 使用方法：
 * POST /wp-json/pim/v1/cleanup-images
 * Headers: X-PIM-Secret: your-secret-key
 * Body: { "product_id": 12345 }
 */

// 防止直接访问
if (!defined('ABSPATH')) {
    // 如果不是 WordPress 环境，尝试加载
    $wp_load_paths = [
        dirname(__FILE__) . '/../../wp-load.php',
        dirname(__FILE__) . '/../../../wp-load.php',
        dirname(__FILE__) . '/../../../../wp-load.php',
    ];
    
    $loaded = false;
    foreach ($wp_load_paths as $path) {
        if (file_exists($path)) {
            require_once $path;
            $loaded = true;
            break;
        }
    }
    
    if (!$loaded) {
        die('WordPress not found');
    }
}

// 安全密钥（部署时修改为你的密钥）
define('PIM_CLEANUP_SECRET', 'pim-cleanup-secret-2024');

/**
 * 注册 REST API 端点
 */
add_action('rest_api_init', function() {
    register_rest_route('pim/v1', '/cleanup-images', [
        'methods' => 'POST',
        'callback' => 'pim_cleanup_product_images',
        'permission_callback' => 'pim_verify_secret',
    ]);
    
    // 健康检查端点
    register_rest_route('pim/v1', '/health', [
        'methods' => 'GET',
        'callback' => function() {
            return new WP_REST_Response([
                'status' => 'ok',
                'time' => current_time('mysql'),
                'site' => get_site_url(),
            ], 200);
        },
        'permission_callback' => '__return_true',
    ]);
});

/**
 * 验证密钥
 */
function pim_verify_secret($request) {
    $secret = $request->get_header('X-PIM-Secret');
    return $secret === PIM_CLEANUP_SECRET;
}

/**
 * 清理商品图片
 */
function pim_cleanup_product_images($request) {
    global $wpdb;
    
    $product_id = intval($request->get_param('product_id'));
    
    if (!$product_id) {
        return new WP_REST_Response([
            'success' => false,
            'error' => 'Missing product_id',
        ], 400);
    }
    
    // 检查商品是否存在
    $product = wc_get_product($product_id);
    if (!$product) {
        return new WP_REST_Response([
            'success' => false,
            'error' => 'Product not found',
        ], 404);
    }
    
    $results = [
        'product_id' => $product_id,
        'attachments_deleted' => 0,
        'files_deleted' => 0,
        'meta_deleted' => 0,
    ];
    
    try {
        // 1. 获取所有附件 ID
        $attachment_ids = $wpdb->get_col($wpdb->prepare(
            "SELECT ID FROM {$wpdb->posts} WHERE post_parent = %d AND post_type = 'attachment'",
            $product_id
        ));
        
        if (!empty($attachment_ids)) {
            // 2. 删除每个附件及其文件
            foreach ($attachment_ids as $attachment_id) {
                // 获取文件路径
                $file_path = get_attached_file($attachment_id);
                
                if ($file_path && file_exists($file_path)) {
                    // 获取文件信息
                    $pathinfo = pathinfo($file_path);
                    $dir = $pathinfo['dirname'];
                    $basename = $pathinfo['filename'];
                    
                    // 删除所有尺寸的文件（包括 webp）
                    $pattern = $dir . '/' . $basename . '*';
                    $files = glob($pattern);
                    
                    foreach ($files as $file) {
                        if (is_file($file)) {
                            unlink($file);
                            $results['files_deleted']++;
                        }
                    }
                }
                
                // 删除附件的 postmeta
                $wpdb->delete($wpdb->postmeta, ['post_id' => $attachment_id]);
                
                // 删除附件记录
                $wpdb->delete($wpdb->posts, ['ID' => $attachment_id]);
                $results['attachments_deleted']++;
            }
        }
        
        // 3. 删除商品的图片元数据
        $meta_keys = ['_thumbnail_id', '_product_image_gallery'];
        foreach ($meta_keys as $meta_key) {
            $deleted = $wpdb->delete($wpdb->postmeta, [
                'post_id' => $product_id,
                'meta_key' => $meta_key,
            ]);
            if ($deleted) {
                $results['meta_deleted']++;
            }
        }
        
        // 4. 清理孤立的 _wp_attached_file 记录
        $wpdb->query("
            DELETE pm FROM {$wpdb->postmeta} pm 
            LEFT JOIN {$wpdb->posts} p ON pm.post_id = p.ID 
            WHERE pm.meta_key = '_wp_attached_file' AND p.ID IS NULL
        ");
        
        // 5. 清除 WooCommerce 缓存
        if (function_exists('wc_delete_product_transients')) {
            wc_delete_product_transients($product_id);
        }
        
        return new WP_REST_Response([
            'success' => true,
            'results' => $results,
        ], 200);
        
    } catch (Exception $e) {
        return new WP_REST_Response([
            'success' => false,
            'error' => $e->getMessage(),
        ], 500);
    }
}

/**
 * 如果是直接访问（不是作为 mu-plugin 加载），处理请求
 */
if (basename($_SERVER['SCRIPT_FILENAME']) === basename(__FILE__)) {
    // 只允许 POST 请求
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        exit;
    }
    
    // 验证密钥
    $headers = getallheaders();
    $secret = $headers['X-PIM-Secret'] ?? $headers['x-pim-secret'] ?? '';
    
    if ($secret !== PIM_CLEANUP_SECRET) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
    
    // 获取请求体
    $input = json_decode(file_get_contents('php://input'), true);
    $product_id = intval($input['product_id'] ?? 0);
    
    if (!$product_id) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing product_id']);
        exit;
    }
    
    // 模拟 WP_REST_Request
    $request = new stdClass();
    $request->get_param = function($key) use ($input) {
        return $input[$key] ?? null;
    };
    
    // 调用清理函数
    header('Content-Type: application/json');
    $result = pim_cleanup_product_images($request);
    echo json_encode($result->data);
}

