import config from '@payload-config'
import { NextResponse, type NextRequest } from 'next/server'
import { getPayload } from 'payload'
import { createOrderSignature, paypalRequest, type PayPalOrder } from '@/lib/paypal'

type CartInput = {
  items?: Array<{
    id?: unknown
    quantity?: unknown
  }>
}

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site') {
      return NextResponse.json(
        { error: 'Cross-origin checkout requests are not allowed.' },
        { status: 403 },
      )
    }

    const body = (await request.json()) as CartInput
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
      return NextResponse.json({ error: 'Your cart is empty or too large.' }, { status: 400 })
    }

    const quantities = new Map<string, number>()
    for (const item of body.items) {
      if (
        typeof item.id !== 'string' ||
        !Number.isInteger(item.quantity) ||
        Number(item.quantity) < 1 ||
        Number(item.quantity) > 20
      ) {
        return NextResponse.json({ error: 'The cart contains an invalid item.' }, { status: 400 })
      }
      quantities.set(item.id, (quantities.get(item.id) ?? 0) + Number(item.quantity))
    }

    if ([...quantities.values()].some((quantity) => quantity > 20)) {
      return NextResponse.json({ error: 'Item quantities cannot exceed 20.' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const products = await payload.find({
      collection: 'products',
      overrideAccess: false,
      depth: 0,
      limit: quantities.size,
      pagination: false,
      where: {
        id: {
          in: [...quantities.keys()],
        },
      },
    })

    if (products.docs.length !== quantities.size) {
      return NextResponse.json(
        { error: 'One or more products are no longer available.' },
        { status: 409 },
      )
    }

    const lineItems = products.docs.map((product) => ({
      id: String(product.id),
      quantity: quantities.get(String(product.id))!,
    }))
    const totalCents = products.docs.reduce(
      (total, product) => total + product.priceCents * quantities.get(String(product.id))!,
      0,
    )
    const value = (totalCents / 100).toFixed(2)
    const configuredOrigin =
      process.env.FIGMA_PUBLIC_URL || process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin
    const origin = new URL(configuredOrigin).origin

    const order = await paypalRequest<PayPalOrder>('/v2/checkout/orders', {
      method: 'POST',
      headers: {
        'PayPal-Request-Id': crypto.randomUUID(),
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            custom_id: `glowup-${createOrderSignature(lineItems)}`,
            amount: {
              currency_code: 'USD',
              value,
              breakdown: {
                item_total: {
                  currency_code: 'USD',
                  value,
                },
              },
            },
            items: products.docs.map((product) => ({
              name: product.name.slice(0, 127),
              sku: product.sku.slice(0, 127),
              quantity: String(quantities.get(String(product.id))),
              unit_amount: {
                currency_code: 'USD',
                value: (product.priceCents / 100).toFixed(2),
              },
            })),
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: 'The Glow Up',
              user_action: 'PAY_NOW',
              shipping_preference: 'GET_FROM_FILE',
              return_url: `${origin}/?paypal=success`,
              cancel_url: `${origin}/?paypal=cancelled`,
            },
          },
        },
      }),
    })

    const approvalUrl = order.links?.find((link) => link.rel === 'payer-action')?.href
    if (!approvalUrl) {
      throw new Error('PayPal did not return an approval link.')
    }

    return NextResponse.json({ orderID: order.id, approvalUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start PayPal checkout.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
