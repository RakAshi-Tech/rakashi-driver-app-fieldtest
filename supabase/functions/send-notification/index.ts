import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

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

    // Get driver FCM token
    const { data: driver } = await supabase
      .from('driver_profiles')
      .select('fcm_token, name')
      .eq('id', driverId)
      .single()

    if (!driver?.fcm_token) {
      return new Response(
        JSON.stringify({ error: 'No FCM token for driver' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get OAuth2 access token for FCM v1 API
    const accessToken = Deno.env.get('FIREBASE_SERVER_KEY')
    const projectId = Deno.env.get('FIREBASE_PROJECT_ID') ?? 'rakashi-notifications'

    const fcmResponse = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: driver.fcm_token,
            notification: {
              title: '🚚 新しい配送依頼',
              body: `${pickupAddress} → ${deliveryAddress} ₹${fare}`,
            },
            data: {
              requestId: String(requestId),
              pickupAddress: String(pickupAddress),
              deliveryAddress: String(deliveryAddress),
              fare: String(fare),
              type: 'new_request',
            },
            android: {
              priority: 'high',
              notification: {
                sound: 'default',
                channel_id: 'delivery_requests',
              },
            },
            webpush: {
              headers: { Urgency: 'high' },
              notification: {
                requireInteraction: true,
                vibrate: [200, 100, 200],
              },
            },
          },
        }),
      }
    )

    const result = await fcmResponse.json()
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
