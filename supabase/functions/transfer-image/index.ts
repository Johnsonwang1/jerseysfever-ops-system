import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { imageUrl, sku, prefix = "ai-processed" } = await req.json();

    if (!imageUrl || !sku) {
      return new Response(
        JSON.stringify({ error: "Missing imageUrl or sku" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Transfer] Starting: ${imageUrl}`);

    // 1. 下载远程图片（服务端无 CORS 限制）
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`下载图片失败: ${response.status}`);
    }

    const imageData = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/png";
    
    // 确定文件扩展名
    let extension = "png";
    if (contentType.includes("jpeg") || contentType.includes("jpg")) {
      extension = "jpg";
    } else if (contentType.includes("gif")) {
      extension = "gif";
    } else if (contentType.includes("webp")) {
      extension = "webp"; // WooCommerce 可能不支持，但先保持原格式
    }

    // 2. 生成文件名
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const cleanSku = sku.replace(/[^a-zA-Z0-9-]/g, "_");
    const filename = `${prefix}/${cleanSku}/${timestamp}-${randomId}.${extension}`;

    // 3. 初始化 Supabase 客户端
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 4. 上传到 Supabase Storage
    const { data, error } = await supabase.storage
      .from("product-images")
      .upload(filename, imageData, {
        contentType,
        upsert: false,
      });

    if (error) {
      throw new Error(`上传失败: ${error.message}`);
    }

    // 5. 获取公开 URL
    const { data: urlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(data.path);

    console.log(`[Transfer] Success: ${urlData.publicUrl}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        url: urlData.publicUrl,
        originalUrl: imageUrl,
        filename: data.path
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Transfer] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

