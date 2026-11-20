import { NextResponse, type NextRequest } from 'next/server'
import { isValidOrderSignature, paypalRequest, type PayPalOrder } from '@/lib/paypal'

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site') {
      return NextResponse.json(
        { error: 'Cross-origin checkout requests are not allowed.' },
        { status: 403 },
      )
    }

    const body = (await request.json()) as { orderID?: unknown }
    if (typeof body.orderID !== 'string' || !/^[A-Z0-9]{8,32}$/i.test(body.orderID)) {
      return NextResponse.json({ error: 'Invalid PayPal order.' }, { status: 400 })
    }

    const order = await paypalRequest<PayPalOrder>(`/v2/checkout/orders/${body.orderID}`)
    const customId = order.purchase_units?.[0]?.custom_id
    if (!isValidOrderSignature(customId)) {
      return NextResponse.json(
        { error: 'This order was not created by The Glow Up.' },
        { status: 403 },
      )
    }

    if (order.status === 'COMPLETED') {
      return NextResponse.json({ orderID: order.id, status: order.status })
    }

    if (order.status !== 'APPROVED') {
      return NextResponse.json(
        { error: `This PayPal order cannot be captured while it is ${order.status}.` },
        { status: 409 },
      )
    }

    const captured = await paypalRequest<PayPalOrder>(
      `/v2/checkout/orders/${body.orderID}/capture`,
      {
        method: 'POST',
        headers: {
          'PayPal-Request-Id': `capture-${body.orderID}`,
        },
      },
    )

    return NextResponse.json({ orderID: captured.id, status: captured.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to capture PayPal payment.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
