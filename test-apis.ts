/**
 * API 连接测试脚本
 * 运行: npx tsx test-apis.ts
 */

// 测试 Gemini API
async function testGeminiAPI() {
  console.log('\n=== 测试 Gemini API ===');

  const { GoogleGenAI } = await import('@google/genai');

  const ai = new GoogleGenAI({ apiKey: 'AIzaSyAHJ3rsL4maSNQFNJiZdmGbcMtg-tMOVw8' });

  try {
    // 简单文本测试
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: 'Say hello in Chinese'
    });

    console.log('✅ Gemini API 连接成功!');
    console.log('响应:', response.text);
    return true;
  } catch (error: any) {
    console.error('❌ Gemini API 连接失败:', error.message);
    return false;
  }
}

// 测试 WooCommerce API
async function testWooCommerceAPI() {
  console.log('\n=== 测试 WooCommerce API (.com) ===');

  const url = 'https://jerseysfever.com';
  const consumerKey = 'ck_ef971832c16308aa87fed8f6318d67b49ca189ee';
  const consumerSecret = 'cs_81ac0091b0cc9bc4cffe4e422fcfb8e72b676dc5';

  try {
    // 测试获取商品列表
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    const response = await fetch(`${url}/wp-json/wc/v3/products?per_page=1`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const products = await response.json();
    console.log('✅ WooCommerce API 连接成功!');
    console.log('获取到商品数量:', products.length);
    if (products.length > 0) {
      console.log('示例商品:', products[0].name);
    }

    // 测试获取分类
    const catResponse = await fetch(`${url}/wp-json/wc/v3/products/categories?per_page=5`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    if (catResponse.ok) {
      const categories = await catResponse.json();
      console.log('分类数量:', categories.length);
      console.log('分类示例:', categories.slice(0, 3).map((c: any) => `${c.name} (ID: ${c.id})`).join(', '));
    }

    // 测试获取属性
    const attrResponse = await fetch(`${url}/wp-json/wc/v3/products/attributes`, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    if (attrResponse.ok) {
      const attributes = await attrResponse.json();
      console.log('\n产品属性:');
      attributes.forEach((attr: any) => {
        console.log(`  - ${attr.name} (ID: ${attr.id})`);
      });
    }

    return true;
  } catch (error: any) {
    console.error('❌ WooCommerce API 连接失败:', error.message);
    return false;
  }
}

// 运行测试
async function main() {
  console.log('开始 API 连接测试...');

  const geminiOk = await testGeminiAPI();
  const wooOk = await testWooCommerceAPI();

  console.log('\n=== 测试结果 ===');
  console.log(`Gemini API: ${geminiOk ? '✅ 正常' : '❌ 失败'}`);
  console.log(`WooCommerce API: ${wooOk ? '✅ 正常' : '❌ 失败'}`);
}

main();
