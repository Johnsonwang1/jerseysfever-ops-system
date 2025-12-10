#!/bin/bash

# JerseysFever 全量同步 Cloud Function 部署脚本

set -e

# 项目配置
PROJECT_ID="snapnest-453114"
REGION="asia-southeast1"
FUNCTION_NAME="jerseysfever-full-sync"
RUNTIME="python312"
ENTRY_POINT="main"

# 检查必要的环境变量
check_env() {
    local var_name=$1
    if [ -z "${!var_name}" ]; then
        echo "❌ 环境变量 $var_name 未设置"
        exit 1
    fi
}

echo "🔐 检查环境变量..."
check_env "SUPABASE_SERVICE_KEY"
check_env "WOO_COM_KEY"
check_env "WOO_COM_SECRET"
check_env "WOO_UK_KEY"
check_env "WOO_UK_SECRET"
check_env "WOO_DE_KEY"
check_env "WOO_DE_SECRET"
check_env "WOO_FR_KEY"
check_env "WOO_FR_SECRET"

echo "📦 部署 Cloud Function: $FUNCTION_NAME"
echo "   项目: $PROJECT_ID"
echo "   区域: $REGION"
echo "   运行时: $RUNTIME"

gcloud functions deploy $FUNCTION_NAME \
    --gen2 \
    --region=$REGION \
    --runtime=$RUNTIME \
    --entry-point=$ENTRY_POINT \
    --trigger-http \
    --allow-unauthenticated \
    --memory=1Gi \
    --timeout=3600s \
    --max-instances=10 \
    --set-env-vars="SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY},WOO_COM_KEY=${WOO_COM_KEY},WOO_COM_SECRET=${WOO_COM_SECRET},WOO_UK_KEY=${WOO_UK_KEY},WOO_UK_SECRET=${WOO_UK_SECRET},WOO_DE_KEY=${WOO_DE_KEY},WOO_DE_SECRET=${WOO_DE_SECRET},WOO_FR_KEY=${WOO_FR_KEY},WOO_FR_SECRET=${WOO_FR_SECRET}" \
    --source=. \
    --project=$PROJECT_ID

echo ""
echo "✅ 部署完成!"
echo ""

# 获取函数 URL
FUNCTION_URL=$(gcloud functions describe $FUNCTION_NAME --gen2 --region=$REGION --project=$PROJECT_ID --format="value(serviceConfig.uri)")
echo "🔗 函数 URL: $FUNCTION_URL"
echo ""
echo "测试命令:"
echo "  curl -X POST $FUNCTION_URL -H 'Content-Type: application/json' -d '{\"action\": \"health\"}'"



