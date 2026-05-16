import jwt
from fastapi import HTTPException


def resolve_identity(token: str) -> dict:
    try:
        payload = jwt.decode(token, options={"verify_signature": False}, audience="ensemble")
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=str(e))
    return {
        "tenantId": payload["tenant_id"], "userId": payload["sub"],
        "email": payload.get("email"), "roles": payload.get("roles", []),
    }
