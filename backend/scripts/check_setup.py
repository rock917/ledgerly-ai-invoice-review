"""Safe setup report: prints configuration names and connection status, never keys."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from app.core.config import get_settings
from app.database import Repository


async def main():
    settings = get_settings()
    if settings.missing_configuration:
        print("Missing configuration: " + ", ".join(settings.missing_configuration))
        return 1
    async with httpx.AsyncClient() as client:
        repo = Repository(settings, client)
        try:
            for table in ["vendors", "purchase_orders", "executions", "stages", "reviews"]:
                rows = await repo.rows(table, {"limit": "1"})
                print(f"Supabase ap_{table}: reachable ({'has data' if rows else 'empty'})")
            await repo.request("POST", "/rest/v1/rpc/ap_dashboard", json={})
            print("Dashboard function: reachable")
            response = await client.get("https://api.groq.com/openai/v1/models", headers={"Authorization": f"Bearer {settings.groq_api_key}"}, timeout=20)
            response.raise_for_status()
            models = {model["id"] for model in response.json()["data"]}
            print("Groq key: accepted")
            print("Configured model: " + ("available" if settings.groq_model in models else "NOT FOUND"))
            return 0 if settings.groq_model in models else 1
        except Exception as exc:
            print(f"Connection check failed ({type(exc).__name__}). Check provider settings; no secrets printed.")
            return 1


raise SystemExit(asyncio.run(main()))
