interface UsePaginationProps {
  currentPage: number;
  totalPages: number;
  paginationItemsToDisplay?: number;
}

interface UsePaginationReturn {
  pages: number[];
  showLeftEllipsis: boolean;
  showRightEllipsis: boolean;
}

export function usePagination({
  currentPage,
  totalPages,
  paginationItemsToDisplay = 5,
}: UsePaginationProps): UsePaginationReturn {
  const pages: number[] = [];
  let showLeftEllipsis = false;
  let showRightEllipsis = false;

  if (totalPages <= paginationItemsToDisplay) {
    // Show all pages if total pages is less than or equal to items to display
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    // Calculate the range of pages to show
    const half = Math.floor(paginationItemsToDisplay / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, currentPage + half);

    // Adjust if we're near the beginning
    if (currentPage <= half + 1) {
      start = 1;
      end = paginationItemsToDisplay;
    }

    // Adjust if we're near the end
    if (currentPage >= totalPages - half) {
      start = totalPages - paginationItemsToDisplay + 1;
      end = totalPages;
    }

    // Show left ellipsis if start is greater than 1
    showLeftEllipsis = start > 1;

    // Show right ellipsis if end is less than totalPages
    showRightEllipsis = end < totalPages;

    // Generate page numbers
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
  }

  return {
    pages,
    showLeftEllipsis,
    showRightEllipsis,
  };
}













