from enum import Enum
from typing import Optional, Dict, Any
from pydantic import BaseModel


# ---------- Match / Alliance Enums ----------
class AllianceType(Enum):
    """Enum representing the alliance types in a match (Red or Blue)."""
    RED = "red"
    BLUE = "blue"


class MatchType(Enum):
    """Enum representing the match types (Qualifying, Semifinal, Final)."""
    QUALIFIER = "qm"
    SEMIFINAL = "sf"
    FINAL = "f"


class MatchTypeBM(BaseModel):
    match_type: MatchType


class StatusType(Enum):
    """Enum representing the different statuses of a match during scouting."""
    UNCLAIMED = "unclaimed"
    PRE = "pre"
    AUTO = "auto"
    TELEOP = "teleop"
    POST = "post"
    OFFLINE = "offline"
    SUBMITTED = "submitted"


# ---------- Scouting Data Models ----------
class FullData(BaseModel):
    alliance: AllianceType
    scouter: str
    match_type: MatchType
    auto: Optional[Dict[str, Any]] = None
    teleop: Optional[Dict[str, Any]] = None
    postmatch: Optional[Dict[str, Any]] = None


# ---------- Session / Auth Models ----------
class SessionPermissions(BaseModel):
    dev: bool
    admin: bool
    match_scouting: bool
    pit_scouting: bool
    guest_access: Dict[str, Any]  # JSONB field (dict form in DB)


class SessionInfo(BaseModel):
    email: str
    name: str
    permissions: SessionPermissions


class PasscodeBody(BaseModel):
    passcode: str
