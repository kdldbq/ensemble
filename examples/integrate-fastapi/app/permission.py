def capabilities_for(identity: dict, resource: dict) -> dict:
    if "admin" in (identity.get("roles") or []):
        return {"canView": True, "canEdit": True, "canShare": True, "canDelete": True}
    return {"canView": True, "canEdit": False, "canShare": False, "canDelete": False}


def mask_rules_for(identity: dict, resource: dict) -> list:
    if "admin" in (identity.get("roles") or []):
        return []
    return [{
        "match": {"type": "column", "sheet": "*", "column": "B"},
        "action": {"type": "redact", "replacement": "***"},
    }]
