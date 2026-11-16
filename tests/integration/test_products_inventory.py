import pytest
from fastapi.testclient import TestClient

from src.api.app import app

client = TestClient(app)


@pytest.fixture
def admin_token():
    res = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "Admin123!"},
    )
    return res.json()["token"]


@pytest.fixture
def customer_token():
    res = client.post(
        "/api/auth/login",
        json={"email": "asha@example.com", "password": "Passw0rd!"},
    )
    return res.json()["token"]


def test_products_list_and_search_pagination():
    # 1. Default pagination
    res = client.get("/api/products?page=1&limit=5")
    assert res.status_code == 200
    body = res.json()
    assert body["page"] == 1
    assert body["limit"] == 5
    assert len(body["data"]) == 5
    assert body["total"] >= 20

    # 2. Search filter (e.g. mouse)
    res_search = client.get("/api/products?search=mouse")
    assert res_search.status_code == 200
    search_data = res_search.json()["data"]
    assert len(search_data) >= 1
    assert any("mouse" in p["name"].lower() for p in search_data)

    # 3. Category filter (e.g. Accessories)
    res_cat = client.get("/api/products?category=Accessories")
    assert res_cat.status_code == 200
    cat_data = res_cat.json()["data"]
    assert len(cat_data) >= 1
    assert all(p["category"] == "Accessories" for p in cat_data)


def test_product_detail_and_404():
    # EP-05
    res = client.get("/api/products/p_17")
    assert res.status_code == 200
    prod = res.json()
    assert prod["id"] == "p_17"
    assert prod["name"] == "Wireless Mouse"
    assert prod["availableQuantity"] == 42
    assert prod["price"] == 799.00

    # 404 for non-existent
    res_404 = client.get("/api/products/non-existent-id")
    assert res_404.status_code == 404
    assert res_404.json()["error"]["code"] == "NOT_FOUND"


def test_admin_product_and_inventory_lifecycle(admin_token, customer_token):
    # Customer forbidden from creating product (EP-06)
    forbidden_res = client.post(
        "/api/products",
        json={
            "name": "Unauthorized Tablet",
            "price": 15000.00,
            "category": "Electronics",
            "availableQuantity": 10,
        },
        headers={"Authorization": f"Bearer {customer_token}"},
    )
    assert forbidden_res.status_code == 403

    # Admin creates product (EP-06)
    create_res = client.post(
        "/api/products",
        json={
            "name": "Pro Gaming Mousepad",
            "description": "RGB stitched edges",
            "price": 1499.00,
            "category": "Accessories",
            "availableQuantity": 25,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert create_res.status_code == 201
    created_prod = create_res.json()
    product_id = created_prod["id"]
    assert created_prod["name"] == "Pro Gaming Mousepad"
    assert created_prod["availableQuantity"] == 25

    # Admin updates product (EP-07)
    update_res = client.put(
        f"/api/products/{product_id}",
        json={"name": "Pro Gaming Mousepad XL", "price": 1799.00},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["name"] == "Pro Gaming Mousepad XL"
    assert update_res.json()["price"] == 1799.00

    # Admin lists inventory (EP-09)
    inv_list_res = client.get(
        "/api/inventory",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert inv_list_res.status_code == 200
    inv_items = inv_list_res.json()
    assert any(i["productId"] == product_id and i["quantityAvailable"] == 25 for i in inv_items)

    # Admin patches inventory (EP-10)
    patch_res = client.patch(
        f"/api/inventory/{product_id}",
        json={"quantityAvailable": 100},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["quantityAvailable"] == 100

    # Verify updated availableQuantity in product detail
    detail_res = client.get(f"/api/products/{product_id}")
    assert detail_res.status_code == 200
    assert detail_res.json()["availableQuantity"] == 100

    # Admin soft deletes product (EP-08)
    del_res = client.delete(
        f"/api/products/{product_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert del_res.status_code == 204

    # Deleted product no longer in public list
    list_after = client.get("/api/products?search=Mousepad+XL")
    assert not any(p["id"] == product_id for p in list_after.json()["data"])
