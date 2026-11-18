from app.models.workspace import Workspace  # noqa: F401 — imported so Base.metadata sees it
from app.models.user import User  # noqa: F401 — imported so Base.metadata sees it
from app.models.datasource import DataSource  # noqa: F401
from app.models.query import QueryHistory  # noqa: F401
from app.models.chart import Chart  # noqa: F401
from app.models.dataset import Dataset  # noqa: F401
from app.models.dashboard import Dashboard  # noqa: F401
from app.models.folder import DashboardFolder  # noqa: F401
from app.models.dashboard_share import DashboardShare  # noqa: F401
from app.models.ai_usage import AIUsage  # noqa: F401
from app.models.fewshot import FewShotExample  # noqa: F401
from app.models.semantic import SemanticDoc, Metric  # noqa: F401
from app.models.kpi import KPI, Alert, AlertEvent  # noqa: F401
from app.models.notification_settings import NotificationSettings  # noqa: F401
from app.models.report import Report, ReportRun  # noqa: F401
from app.models.chat_session import ChatSession, ChatMessage  # noqa: F401
from app.models.query_cache import QueryCache  # noqa: F401
