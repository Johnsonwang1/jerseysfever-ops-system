import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 视频文件最大 50MB（Supabase Storage 限制）
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { videoUrl, sku } = await req.json();

    if (!videoUrl || !sku) {
      return new Response(
        JSON.stringify({ error: "Missing videoUrl or sku" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Transfer Video] Starting: ${videoUrl}`);

    // 1. 下载远程视频（服务端无 CORS 限制）
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`下载视频失败: ${response.status}`);
    }

    // 检查文件大小
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_VIDEO_SIZE) {
      throw new Error(`视频文件过大，最大支持 50MB`);
    }

    const videoData = await response.arrayBuffer();

    // 再次检查实际大小
    if (videoData.byteLength > MAX_VIDEO_SIZE) {
      throw new Error(`视频文件过大 (${(videoData.byteLength / 1024 / 1024).toFixed(1)}MB)，最大支持 50MB`);
    }

    const contentType = response.headers.get("content-type") || "video/mp4";

    // 确定文件扩展名
    let extension = "mp4";
    if (contentType.includes("webm")) {
      extension = "webm";
    } else if (contentType.includes("mov") || contentType.includes("quicktime")) {
      extension = "mov";
    } else if (contentType.includes("avi")) {
      extension = "avi";
    }

    // 2. 生成文件名
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const cleanSku = sku.replace(/[^a-zA-Z0-9-]/g, "_");
    const filename = `products/${cleanSku}/${timestamp}-${randomId}.${extension}`;

    // 3. 初始化 Supabase 客户端
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 4. 上传到 Supabase Storage (product-videos bucket)
    const { data, error } = await supabase.storage
      .from("product-videos")
      .upload(filename, videoData, {
        contentType,
        upsert: false,
      });

    if (error) {
      throw new Error(`上传失败: ${error.message}`);
    }

    // 5. 获取公开 URL
    const { data: urlData } = supabase.storage
      .from("product-videos")
      .getPublicUrl(data.path);

    const fileSizeMB = (videoData.byteLength / 1024 / 1024).toFixed(2);
    console.log(`[Transfer Video] Success: ${urlData.publicUrl} (${fileSizeMB}MB)`);

    return new Response(
      JSON.stringify({
        success: true,
        url: urlData.publicUrl,
        originalUrl: videoUrl,
        filename: data.path,
        size: videoData.byteLength
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Transfer Video] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
