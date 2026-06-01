"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SearchResult } from "../types"
import Image from "next/image"

interface SearchResultsListProps {
  results: SearchResult[]
  isLoading: boolean
  searchQuery: string
  viewMode?: 'list' | 'grid'
}

export function SearchResultsList({ results, isLoading, searchQuery, viewMode = 'list' }: SearchResultsListProps) {
  if (isLoading) {
    return (
      <div className={viewMode === 'grid' 
        ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" 
        : "space-y-4"
      }>
        {[...Array(viewMode === 'grid' ? 8 : 3)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className={viewMode === 'grid' 
              ? "aspect-square bg-muted rounded-lg" 
              : "h-32 bg-muted rounded-lg"
            }></div>
          </div>
        ))}
      </div>
    )
  }

  if (results.length === 0 && searchQuery) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground text-lg">No results found for "{searchQuery}"</p>
        <p className="text-muted-foreground mt-2">Try adjusting your search terms or filters</p>
      </div>
    )
  }

  if (results.length === 0) {
    return null
  }

  return (
    <div className={viewMode === 'grid' 
      ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" 
      : "space-y-6"
    }>
      {results.map((result) => (
        viewMode === 'grid' ? (
          <GridResultCard key={result.id} result={result} />
        ) : (
          <ListResultCard key={result.id} result={result} />
        )
      ))}
    </div>
  )
}

function ListResultCard({ result }: { result: SearchResult }) {
  const data = result.data
  
  const getColorForText = (text: string): string => {
    let hash = 0
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    
    const colors = [
      'bg-blue-100 text-blue-800',
      'bg-green-100 text-green-800', 
      'bg-purple-100 text-purple-800',
      'bg-orange-100 text-orange-800',
      'bg-pink-100 text-pink-800',
      'bg-indigo-100 text-indigo-800',
      'bg-yellow-100 text-yellow-800',
      'bg-red-100 text-red-800'
    ]
    
    return colors[Math.abs(hash) % colors.length]
  }

  const formatPrice = (price: any): string => {
    if (price === null || price === undefined) return ''
    if (typeof price === 'number') return `$${price.toFixed(2)}`
    if (typeof price === 'string') return price.includes('$') ? price : `$${price}`
    return String(price)
  }

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <div className="flex">
        <div className="w-48 h-48 flex-shrink-0">
          {(data.image || data.primaryImageUrl) ? (
            <Image
              src={data.image || data.primaryImageUrl}
              alt={data.title || 'Product image'}
              width={192}
              height={192}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <span className="text-muted-foreground text-sm">No image</span>
            </div>
          )}
        </div>
        
        <div className="flex-1 p-6">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="font-semibold text-lg line-clamp-2 text-blue-600 hover:text-blue-800 cursor-pointer">
                  {data.title || 'Untitled'}
                </h3>
                {data.brand && (
                  <p className="text-sm text-muted-foreground mt-1">
                    by {data.brand}
                  </p>
                )}
                {data.description && (
                  <p className="text-muted-foreground mt-2 line-clamp-3 text-sm leading-relaxed">
                    {data.description}
                  </p>
                )}
              </div>
              
              <div className="ml-6 text-right flex-shrink-0">
                {data.sale_price || data.compareAtPrice !== data.price ? (
                  <div className="space-y-1">
                    <p className="font-bold text-lg text-red-600">
                      {formatPrice(data.sale_price || data.price)}
                    </p>
                    {data.compareAtPrice && data.compareAtPrice !== data.price && (
                      <p className="text-sm line-through text-muted-foreground">
                        {formatPrice(data.compareAtPrice)}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="font-bold text-lg text-green-600">
                    {formatPrice(data.price)}
                  </p>
                )}
                {data.priceRange && data.priceRange !== formatPrice(data.price) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {data.priceRange}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {data.availability && (
                <Badge 
                  variant="secondary" 
                  className={data.availability === 'in_stock' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}
                >
                  {data.availability.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                </Badge>
              )}
              
              {data.categories && data.categories.length > 0 && data.categories[0] && (
                <Badge variant="outline" className={getColorForText(data.categories[0])}>
                  {data.categories[0]}
                </Badge>
              )}
              
              {data.materials && data.materials.length > 0 && (
                <Badge variant="outline" className={getColorForText(data.materials[0])}>
                  {data.materials[0]}
                </Badge>
              )}
              
              {result.score && (
                <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
                  Score: {result.score.toFixed(2)}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

function GridResultCard({ result }: { result: SearchResult }) {
  const data = result.data
  
  const getColorForText = (text: string): string => {
    let hash = 0
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    
    const colors = [
      'bg-blue-100 text-blue-800',
      'bg-green-100 text-green-800', 
      'bg-purple-100 text-purple-800',
      'bg-orange-100 text-orange-800',
      'bg-pink-100 text-pink-800',
      'bg-indigo-100 text-indigo-800'
    ]
    
    return colors[Math.abs(hash) % colors.length]
  }

  const formatPrice = (price: any): string => {
    if (price === null || price === undefined) return ''
    if (typeof price === 'number') return `$${price.toFixed(2)}`
    if (typeof price === 'string') return price.includes('$') ? price : `$${price}`
    return String(price)
  }

  const getMainAttribute = () => {
    for (const [key, value] of Object.entries(data)) {
      if (['id', 'title', 'description', 'image', 'primaryImageUrl', 'price', 'sale_price'].includes(key)) {
        continue
      }
      if (Array.isArray(value) && value.length > 0) {
        return { key, value: value[0] }
      }
      if (value && typeof value === 'string' && value.trim()) {
        return { key, value }
      }
    }
    return null
  }

  const mainAttribute = getMainAttribute()

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow h-fit">
      <div className="aspect-square">
        {(data.image || data.primaryImageUrl) ? (
          <Image
            src={data.image || data.primaryImageUrl}
            alt={data.title || 'Product image'}
            width={300}
            height={300}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center">
            <span className="text-muted-foreground text-sm">No image</span>
          </div>
        )}
      </div>
      
      <div className="p-3 space-y-2">
        <h3 className="font-medium text-sm line-clamp-2 leading-tight">
          {data.title || 'Untitled'}
        </h3>
        
        {(data.price || data.sale_price) && (
          <div className="flex items-center gap-2">
            {data.sale_price && (
              <span className="font-bold text-sm text-red-600">
                {formatPrice(data.sale_price)}
              </span>
            )}
            {data.price && (
              <span className={`text-xs ${
                data.sale_price ? 'line-through text-muted-foreground' : 'font-bold text-sm'
              }`}>
                {formatPrice(data.price)}
              </span>
            )}
          </div>
        )}
        
        {mainAttribute && (
          <Badge 
            variant="outline" 
            className={`text-xs ${getColorForText(String(mainAttribute.value))}`}
          >
            {String(mainAttribute.value)}
          </Badge>
        )}
      </div>
    </Card>
  )
}