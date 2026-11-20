import Storefront from '@/components/Storefront'
import { getStoreProducts } from '@/lib/store-products'

export default async function HomePage() {
  const products = await getStoreProducts()

  return <Storefront products={products} />
}
