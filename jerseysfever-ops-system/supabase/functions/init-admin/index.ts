import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, password, name } = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: '需要 email 和 password' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 创建用户
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: name || email.split('@')[0], role: 'admin' }
    });

    if (createError) {
      // 如果用户已存在，尝试更新密码
      if (createError.message.includes('already been registered')) {
        // 获取用户列表找到该用户
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) {
          return new Response(
            JSON.stringify({ error: listError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const user = users.find(u => u.email === email);
        if (user) {
          // 更新密码
          const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            user.id,
            { password }
          );
          
          if (updateError) {
            return new Response(
              JSON.stringify({ error: updateError.message }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // 确保 user_profiles 存在
          await supabaseAdmin.from('user_profiles').upsert({
            id: user.id,
            email: user.email,
            name: name || email.split('@')[0],
            role: 'admin'
          }, { onConflict: 'id' });

          return new Response(
            JSON.stringify({ success: true, message: '密码已更新', userId: user.id }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 创建 user_profiles
    if (newUser?.user) {
      await supabaseAdmin.from('user_profiles').upsert({
        id: newUser.user.id,
        email: newUser.user.email,
        name: name || email.split('@')[0],
        role: 'admin'
      }, { onConflict: 'id' });
    }

    return new Response(
      JSON.stringify({ success: true, user: newUser?.user }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : '操作失败' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

