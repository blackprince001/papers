from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.paper import Paper
from app.models.reading_session import ReadingSession
from app.schemas.reading_progress import ReadingStatistics, ReadingStreak


class ReadingTrackerService:
  async def calculate_statistics(self, session: AsyncSession) -> ReadingStatistics:
    """Calculate reading statistics for dashboard."""
    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=now.weekday())
    month_start = now.replace(day=1)
    year_start = now.replace(month=1, day=1)

    # Papers read this week/month/year
    papers_read_this_week = (
      await session.scalar(
        select(func.count(Paper.id)).where(
          Paper.reading_status == "read", Paper.status_updated_at >= week_start
        )
      )
      or 0
    )

    papers_read_this_month = (
      await session.scalar(
        select(func.count(Paper.id)).where(
          Paper.reading_status == "read", Paper.status_updated_at >= month_start
        )
      )
      or 0
    )

    papers_read_this_year = (
      await session.scalar(
        select(func.count(Paper.id)).where(
          Paper.reading_status == "read", Paper.status_updated_at >= year_start
        )
      )
      or 0
    )

    # Total reading time
    total_reading_time = (
      await session.scalar(select(func.sum(Paper.reading_time_minutes))) or 0
    )

    # Average reading time per paper
    total_papers = await session.scalar(select(func.count(Paper.id))) or 1
    average_reading_time = (
      total_reading_time / total_papers if total_papers > 0 else 0.0
    )

    # Reading streak
    streak_data = await self._calculate_streak(session)

    # Status distribution
    status_dist = await session.execute(
      select(Paper.reading_status, func.count(Paper.id))
      .group_by(Paper.reading_status)
      .where(Paper.reading_status.isnot(None))
    )
    status_distribution = {status: count for status, count in status_dist.fetchall()}

    # Priority distribution
    priority_dist = await session.execute(
      select(Paper.priority, func.count(Paper.id))
      .group_by(Paper.priority)
      .where(Paper.priority.isnot(None))
    )
    priority_distribution = {
      priority: count for priority, count in priority_dist.fetchall()
    }

    return ReadingStatistics(
      papers_read_this_week=papers_read_this_week,
      papers_read_this_month=papers_read_this_month,
      papers_read_this_year=papers_read_this_year,
      total_reading_time_minutes=total_reading_time,
      average_reading_time_per_paper=average_reading_time,
      reading_streak_days=streak_data.current_streak,
      status_distribution=status_distribution,
      priority_distribution=priority_distribution,
    )

  async def _calculate_streak(self, session: AsyncSession) -> ReadingStreak:
    """Calculate reading streak (consecutive days with reading activity)."""
    # Get all reading sessions ordered by date
    sessions = await session.execute(
      select(func.date(ReadingSession.start_time).label("date"))
      .distinct()
      .order_by(func.date(ReadingSession.start_time).desc())
    )

    dates_with_activity = [row[0] for row in sessions.fetchall() if row[0]]

    if not dates_with_activity:
      return ReadingStreak(
        current_streak=0,
        longest_streak=0,
        streak_start_date=None,
        last_reading_date=None,
      )

    # Sort dates descending
    dates_with_activity = sorted(set(dates_with_activity), reverse=True)
    last_reading_date = dates_with_activity[0]

    # Calculate current streak
    current_streak = 0
    today = datetime.now(timezone.utc).date()
    expected_date = today

    for date in dates_with_activity:
      if date == expected_date:
        current_streak += 1
        expected_date = expected_date - timedelta(days=1)
      elif date < expected_date:
        break

    # Calculate longest streak
    longest_streak = 0
    current_run = 0
    prev_date = None

    for date in sorted(dates_with_activity, reverse=False):
      if prev_date is None:
        current_run = 1
      elif (date - prev_date).days == 1:
        current_run += 1
      else:
        longest_streak = max(longest_streak, current_run)
        current_run = 1
      prev_date = date

    longest_streak = max(longest_streak, current_run)

    streak_start_date = (
      dates_with_activity[current_streak - 1] if current_streak > 0 else None
    )

    return ReadingStreak(
      current_streak=current_streak,
      longest_streak=longest_streak,
      streak_start_date=datetime.combine(
        streak_start_date, datetime.min.time()
      ).replace(tzinfo=timezone.utc)
      if streak_start_date
      else None,
      last_reading_date=datetime.combine(
        last_reading_date, datetime.min.time()
      ).replace(tzinfo=timezone.utc)
      if last_reading_date
      else None,
    )

  async def get_reading_streak(self, session: AsyncSession) -> ReadingStreak:
    """Get reading streak information."""
    return await self._calculate_streak(session)

  async def aggregate_reading_time(self, session: AsyncSession, paper_id: int) -> int:
    """Aggregate reading time from sessions for a paper."""
    total_minutes = await session.scalar(
      select(func.sum(ReadingSession.duration_minutes)).where(
        ReadingSession.paper_id == paper_id
      )
    )
    return total_minutes or 0


reading_tracker_service = ReadingTrackerService()
