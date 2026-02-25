import json
import os
import asyncio
import ssl
import asyncpg
import certifi
import dotenv


class Context:
    def __init__(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)

        self.DATABASE_KEY = ""
        self.TBA_API_KEY = ""
        self.FRC_API_KEY = ""
        self.downloaded_data = {}
        self.calc_result = {"result": {}}
        self.repl_globals = {}  # populated after init

        self.DATABASE_SCHEMA = {
            "match_scouting": {
                "match", "match_type", "team", "alliance", "scouter",
                "status", "data", "last_modified", "event_key"
            },
            "matches": {
                "key", "event_key", "match_type", "match_number",
                "set_number", "scheduled_time", "actual_time",
                "red1", "red2", "red3", "blue1", "blue2", "blue3"
            },
            "matches_tba": {
                "match_key", "event_key", "match_number",
                "winning_alliance", "red_teams", "blue_teams",
                "red_score", "blue_score",
                "red_rp", "blue_rp",
                "red_auto_points", "blue_auto_points",
                "red_teleop_points", "blue_teleop_points",
                "red_endgame_points", "blue_endgame_points",
                "score_breakdown", "videos",
                "red_coopertition_criteria", "blue_coopertition_criteria"
            },
            "pit_scouting": {
                "event_key", "team", "scouter",
                "status", "data", "last_modified"
            },
            "processed_data": {
                "event_key", "time_added", "data"
            }
        }

    def load_env(self):
        """Load .env and populate keys. Returns list of errors."""
        errors = []
        env_path = dotenv.find_dotenv()
        dotenv.load_dotenv(env_path, override=True)

        self.DATABASE_KEY = os.getenv("DATABASE_KEY", "")
        self.TBA_API_KEY = os.getenv("TBA_API_KEY", "")
        self.FRC_API_KEY = os.getenv("FRC_API_KEY", "")

        if not self.DATABASE_KEY:
            errors.append("DATABASE_KEY is missing from .env file")
        if not self.TBA_API_KEY:
            errors.append("TBA_API_KEY is missing from .env file")
        if not self.FRC_API_KEY:
            errors.append("FRC_API_KEY is missing from .env file")
        return errors

    async def get_connection(self):
        """
        Create and configure a PostgreSQL database connection.

        Returns:
            asyncpg.Connection: Configured database connection with SSL and JSON codecs
        """
        if not self.DATABASE_KEY:
            raise RuntimeError("DATABASE_KEY not set")

        ssl_context = ssl.create_default_context(cafile=certifi.where())
        conn = await asyncpg.connect(dsn=self.DATABASE_KEY, ssl=ssl_context)

        await conn.set_type_codec(
            "jsonb",
            encoder=json.dumps,
            decoder=json.loads,
            schema="pg_catalog"
        )
        await conn.set_type_codec(
            "json",
            encoder=json.dumps,
            decoder=json.loads,
            schema="pg_catalog"
        )

        return conn

    async def verify_db(self):
        """
        Validate database connectivity and schema integrity.

        Returns:
            tuple: (ok: bool, errors: list[str])
        """

        errors = []

        if not self.DATABASE_KEY:
            return False, ["DATABASE_KEY is not set"]

        if not isinstance(self.DATABASE_SCHEMA, dict) or not self.DATABASE_SCHEMA:
            return False, ["DATABASE_SCHEMA is not defined or empty"]

        conn = None
        try:
            ssl_context = ssl.create_default_context(cafile=certifi.where())
            conn = await asyncpg.connect(dsn=self.DATABASE_KEY, ssl=ssl_context)

            rows = await conn.fetch("""
                                    SELECT table_name
                                    FROM information_schema.tables
                                    WHERE table_schema = 'public';
                                    """)
            existing_tables = {r["table_name"] for r in rows}

            for table in self.DATABASE_SCHEMA:
                if table not in existing_tables:
                    errors.append(f"Missing table: {table}")

            for table, required_cols in self.DATABASE_SCHEMA.items():
                if table not in existing_tables:
                    continue

                col_rows = await conn.fetch("""
                                            SELECT column_name
                                            FROM information_schema.columns
                                            WHERE table_schema = 'public'
                                              AND table_name = $1;
                                            """, table)

                existing_cols = {r["column_name"] for r in col_rows}
                missing = set(required_cols) - existing_cols

                if missing:
                    errors.append(
                        f"{table}: missing columns: {', '.join(sorted(missing))}"
                    )

            return len(errors) == 0, errors

        except asyncpg.InvalidPasswordError:
            return False, ["Authentication failed"]
        except asyncpg.InvalidAuthorizationSpecificationError:
            return False, ["Authorization failed"]
        except asyncpg.PostgresError as e:
            return False, [f"Postgres error: {e}"]
        except Exception as e:
            return False, [f"Unexpected error: {e}"]
        finally:
            if conn:
                await conn.close()

    def run_async(self, coro):
        return self.loop.run_until_complete(coro)


# Singleton — created once at import time
ctx = Context()
