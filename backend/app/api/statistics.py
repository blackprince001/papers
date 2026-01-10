from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.schemas.reading_progress import ReadingStatistics, ReadingStreak
from app.services.reading_tracker import reading_tracker_service

router = APIRouter()


@router.get("/statistics/dashboard", response_model=ReadingStatistics)
async def get_dashboard_statistics(session: AsyncSession = Depends(get_db)):
  """Get reading statistics for dashboard."""
  return await reading_tracker_service.calculate_statistics(session)


@router.get("/statistics/reading-streaks", response_model=ReadingStreak)
async def get_reading_streaks(session: AsyncSession = Depends(get_db)):
  """Get reading streak information."""
  return await reading_tracker_service.get_reading_streak(session)
