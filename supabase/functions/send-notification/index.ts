import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore - npm module for Deno
import webpush from 'npm:web-push'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { driverId, requestId, pickupAddress, deliveryAddress, fare } =
      await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ドライバーの Web Push サブスクリプションを取得
    const { data: driver } = await supabase
      .from('driver_profiles')
      .select('fcm_token, name')
      .eq('id', driverId)
      .single()

    if (!driver?.fcm_token) {
      return new Response(
        JSON.stringify({ error: 'No push subscription for driver' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // VAPID 設定
    webpush.setVapidDetails(
      Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@rakashi.com',
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!
    )

    // サブスクリプション情報をパース
    const subscription = JSON.parse(driver.fcm_token)

    // 暗号化済みプッシュ通知を送信
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: '🚚 新しい配送依頼',
        body: `${pickupAddress} → ${deliveryAddress}  ₹${fare}`,
        type: 'new_request',
        requestId: String(requestId),
      })
    )

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    console.error('send-notification error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
