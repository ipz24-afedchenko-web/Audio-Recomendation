"""
Smoke tests for the auth routes (register / login / me).
"""

def test_register_creates_user(client):
    r = client.post(
        "/api/auth/register",
        json={
            "email": "alice@example.com",
            "username": "alice",
            "password": "supersecret123",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["username"] == "alice"
    assert body["email"] == "alice@example.com"
    assert "hashed_password" not in body
    assert "password" not in body


def test_register_rejects_duplicate_email(client):
    payload = {
        "email": "bob@example.com",
        "username": "bob",
        "password": "supersecret123",
    }
    assert client.post("/api/auth/register", json=payload).status_code == 201
    payload["username"] = "bob2"
    r = client.post("/api/auth/register", json=payload)
    assert r.status_code == 400
    assert "email" in r.json()["detail"].lower()


def test_register_rejects_duplicate_username(client):
    client.post(
        "/api/auth/register",
        json={"email": "x@x.com", "username": "carol", "password": "supersecret123"},
    )
    r = client.post(
        "/api/auth/register",
        json={"email": "y@x.com", "username": "carol", "password": "supersecret123"},
    )
    assert r.status_code == 400
    assert "username" in r.json()["detail"].lower()


def test_register_rejects_short_password(client):
    r = client.post(
        "/api/auth/register",
        json={"email": "a@a.com", "username": "a", "password": "short"},
    )
    assert r.status_code == 422  # pydantic validation


def test_login_returns_token(client, auth_headers):
    # auth_headers fixture already exercises login successfully;
    # re-verify the shape of the login response.
    r = client.post(
        "/api/auth/login",
        data={"username": "testuser", "password": "supersecret123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer"
    assert isinstance(body["access_token"], str) and len(body["access_token"]) > 20


def test_login_rejects_wrong_password(client, auth_headers):
    r = client.post(
        "/api/auth/login",
        data={"username": "testuser", "password": "wrong-password"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert r.status_code == 401


def test_me_requires_token(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_me_returns_current_user(client, auth_headers):
    r = client.get("/api/auth/me", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["username"] == "testuser"
