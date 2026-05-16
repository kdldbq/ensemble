import hashlib, hmac, json, os
from datetime import datetime, timedelta

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from .identity import resolve_identity
from .permission import capabilities_for, mask_rules_for
from .event import handle_event

app = FastAPI(title="ensemble FastAPI host example")

HOST_SECRET = os.environ.get("HOST_SECRET", "dev-secret").encode()
_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
KEY_PEM = _KEY.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption(),
)
PUBLIC_JWK = jwt.algorithms.RSAAlgorithm.to_jwk(_KEY.public_key())


@app.get("/.well-known/jwks.json")
def jwks() -> dict:
    return {"keys": [json.loads(PUBLIC_JWK) | {"kid": "demo-key", "alg": "RS256", "use": "sig"}]}


@app.post("/issue-token")
def issue_token(user_id: str, tenant_id: str) -> dict:
    now = datetime.utcnow()
    payload = {
        "iss": "fastapi-host", "aud": "ensemble", "sub": user_id, "tenant_id": tenant_id,
        "iat": int(now.timestamp()), "exp": int((now + timedelta(hours=1)).timestamp()),
    }
    token = jwt.encode(payload, _KEY, algorithm="RS256", headers={"kid": "demo-key"})
    return {"token": token}


def _verify(request: Request, body: bytes) -> None:
    expected = "sha256=" + hmac.new(HOST_SECRET, body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, request.headers.get("X-Ensemble-Signature", "")):
        raise HTTPException(status_code=401, detail="bad signature")


@app.post("/api/ensemble/identity")
async def ep_identity(request: Request) -> JSONResponse:
    body = await request.body(); _verify(request, body)
    return JSONResponse(resolve_identity(json.loads(body)["token"]))


@app.post("/api/ensemble/permission")
async def ep_permission(request: Request) -> JSONResponse:
    body = await request.body(); _verify(request, body)
    data = json.loads(body)
    if data["op"] == "capabilities":
        return JSONResponse(capabilities_for(data["identity"], data["resource"]))
    if data["op"] == "mask_rules":
        return JSONResponse(mask_rules_for(data["identity"], data["resource"]))
    return JSONResponse({"error": "unknown op"}, status_code=400)


@app.post("/api/ensemble/event")
async def ep_event(request: Request) -> PlainTextResponse:
    body = await request.body(); _verify(request, body)
    handle_event(json.loads(body))
    return PlainTextResponse("", status_code=204)
