'use client'

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface TablePaginationProps {
  page: number
  pageSize: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export function TablePagination({
  page,
  pageSize,
  totalPages,
  total,
  onPageChange,
  onPageSizeChange,
}: TablePaginationProps) {
  const handleSelectPageSize = (val: string) => {
    onPageSizeChange(Number(val))
    onPageChange(1)
  }

  return (
    <Pagination className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <p className="hidden sm:flex text-sm text-muted-foreground">Exibindo</p>
        <Select value={String(pageSize)} onValueChange={handleSelectPageSize}>
          <SelectTrigger className="w-20" aria-label="Itens por página">
            <SelectValue placeholder="Exibir" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">de</p>
        <p className="text-sm text-muted-foreground">{total}</p>
      </div>
      <PaginationContent>
        {page > 1 && (
          <PaginationItem className="hidden sm:flex cursor-pointer">
            <PaginationPrevious onClick={() => onPageChange(page - 1)} />
          </PaginationItem>
        )}

        {/* First Page */}
        <PaginationItem>
          <PaginationLink isActive={page === 1} onClick={() => onPageChange(1)}>
            1
          </PaginationLink>
        </PaginationItem>

        {/* Previous page (if not 1 or 2) */}
        {page > 2 && (
          <PaginationItem>
            <PaginationLink onClick={() => onPageChange(page - 1)}>{page - 1}</PaginationLink>
          </PaginationItem>
        )}

        {/* Current page (if not 1 or last) */}
        {page !== 1 && page !== totalPages && totalPages > 0 && (
          <PaginationItem>
            <PaginationLink isActive onClick={() => onPageChange(page)}>
              {page}
            </PaginationLink>
          </PaginationItem>
        )}

        {/* Next page (if not last or second to last) */}
        {page < totalPages - 1 && (
          <PaginationItem>
            <PaginationLink onClick={() => onPageChange(page + 1)}>{page + 1}</PaginationLink>
          </PaginationItem>
        )}

        {/* ... and last page */}
        {page < totalPages - 2 && (
          <PaginationItem>
            <span className="px-2 text-muted-foreground">...</span>
          </PaginationItem>
        )}

        {/* Last page (if not 1) */}
        {totalPages > 1 && (
          <PaginationItem>
            <PaginationLink isActive={page === totalPages} onClick={() => onPageChange(totalPages)}>
              {totalPages}
            </PaginationLink>
          </PaginationItem>
        )}

        {page < totalPages && (
          <PaginationItem className="hidden sm:flex cursor-pointer">
            <PaginationNext onClick={() => onPageChange(page + 1)} />
          </PaginationItem>
        )}
      </PaginationContent>
    </Pagination>
  )
}
