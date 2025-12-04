import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: '未授权' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // 验证请求者身份
    const { data: { user: requestUser }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !requestUser) {
      return new Response(
        JSON.stringify({ error: '无法验证用户身份' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 检查是否为管理员
    const { data: requestProfile } = await supabaseClient
      .from('user_profiles')
      .select('role')
      .eq('id', requestUser.id)
      .single();

    if (!requestProfile || requestProfile.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: '权限不足，只有管理员可以更新用户' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { userId, email, name, role, password } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: '缺少用户 ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 更新 auth.users（邮箱和密码）
    const authUpdates: { email?: string; password?: string } = {};
    if (email) authUpdates.email = email;
    if (password) authUpdates.password = password;

    if (Object.keys(authUpdates).length > 0) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        authUpdates
      );

      if (authError) {
        return new Response(
          JSON.stringify({ error: authError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 更新 user_profiles
    const profileUpdates: { name?: string; role?: string; email?: string; updated_at: string } = {
      updated_at: new Date().toISOString()
    };
    if (name) profileUpdates.name = name;
    if (role) profileUpdates.role = role;
    if (email) profileUpdates.email = email;

    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .update(profileUpdates)
      .eq('id', userId);

    if (profileError) {
      return new Response(
        JSON.stringify({ error: profileError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : '更新用户失败' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});


