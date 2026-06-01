"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Grid, List } from "lucide-react"

interface SearchStatsProps {
  searchQuery: string
  totalResults: number
  searchDuration: number
  totalSelectedFacets: number
  viewMode: 'list' | 'grid'
  onViewModeChange: (mode: 'list' | 'grid') => void
  currentPage: number
  totalPages: number
}

export function SearchStats({
  searchQuery,
  totalResults,
  searchDuration,
  totalSelectedFacets,
  viewMode,
  onViewModeChange,
  currentPage,
  totalPages
}: SearchStatsProps) {
  if (!searchQuery) return null

  return (
    <div className="mb-6">
      <div className="flex justify-between items-center text-sm text-muted-foreground mb-4">
        <span>
          {totalResults} result{totalResults !== 1 ? 's' : ''} found for "{searchQuery}"
          {totalSelectedFacets > 0 && (
            <Badge variant="secondary" className="ml-2">
              {totalSelectedFacets} filter{totalSelectedFacets !== 1 ? 's' : ''} applied
            </Badge>
          )}
        </span>
        <span>
          {searchDuration > 0 && `Search completed in ${searchDuration}ms`}
        </span>
      </div>
      
      {/* View Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">View:</span>
            <div className="flex border rounded-md">
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onViewModeChange('list')}
                className="rounded-r-none"
              >
                <List className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onViewModeChange('grid')}
                className="rounded-l-none"
              >
                <Grid className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
        
        {/* Pagination Info */}
        {totalPages > 1 && (
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
        )}
      </div>
    </div>
  )
}