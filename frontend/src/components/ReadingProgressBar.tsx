interface ReadingProgressBarProps {
  currentPage?: number;
  totalPages?: number;
  readingTimeMinutes?: number;
  className?: string;
}

export function ReadingProgressBar({
  currentPage,
  totalPages,
  readingTimeMinutes,
  className,
}: ReadingProgressBarProps) {
  const progressPercentage =
    currentPage && totalPages ? Math.min((currentPage / totalPages) * 100, 100) : 0;

  return (
    <div className={`space-y-2 ${className || ''}`}>
      {currentPage && totalPages && (
        <div>
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
            <span>Page {currentPage} of {totalPages}</span>
            <span>{Math.round(progressPercentage)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      )}
      {readingTimeMinutes !== undefined && readingTimeMinutes > 0 && (
        <div className="text-xs text-gray-600">
          Reading time: {Math.floor(readingTimeMinutes / 60)}h {readingTimeMinutes % 60}m
        </div>
      )}
    </div>
  );
}

