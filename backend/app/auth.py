"""Validate sessions with Supabase Auth; never trust browser-supplied user IDs."""
import secrets
from dataclasses import dataclass
from uuid import UUID

import httpx

from app.core.config import Settings
from app.core.errors import ServiceError


@dataclass(frozen=True)
class Identity:
    user_id: str | None
    name: str
    email: str = ''


async def authenticate(token: str, settings: Settings, client: httpx.AsyncClient) -> Identity:
    if not token:
        raise ServiceError('Sign in to continue.', 401, 'unauthorized')
    if settings.enable_legacy_demo and settings.demo_access_token and secrets.compare_digest(token, settings.demo_access_token):
        return Identity(None, 'Legacy demo')
    try:
        response = await client.get(settings.supabase_url.rstrip('/') + '/auth/v1/user',
                                    headers={'apikey': settings.supabase_service_role_key, 'Authorization': f'Bearer {token}'}, timeout=15)
    except httpx.HTTPError as exc:
        raise ServiceError('Sign-in verification is temporarily unavailable. Please retry.', 503, 'auth_unavailable') from exc
    if response.status_code in (401, 403):
        raise ServiceError('Your session has expired. Please sign in again.', 401, 'unauthorized')
    if response.status_code != 200:
        raise ServiceError('Sign-in verification is temporarily unavailable. Please retry.', 503, 'auth_unavailable')
    try:
        user = response.json()
        user_id = str(UUID(user['id']))
        if user.get('is_anonymous') or not user.get('email') or not user.get('email_confirmed_at'):
            raise ServiceError('Confirm your email address before opening your workspace.', 403, 'email_unconfirmed')
        metadata = user.get('user_metadata') or {}
        name = str(metadata.get('full_name') or metadata.get('name') or user['email'].split('@')[0]).strip()[:100]
        return Identity(user_id, name if len(name) >= 2 else 'Workspace owner', user['email'])
    except (KeyError, ValueError, TypeError, AttributeError) as exc:
        raise ServiceError('The sign-in response could not be verified.', 401, 'unauthorized') from exc
