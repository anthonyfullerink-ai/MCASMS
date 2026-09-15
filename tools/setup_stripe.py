import os
import sys
import json
import urllib.request
import urllib.parse
import re

def create_stripe_product_and_link(secret_key):
    """
    Automates Stripe $49.99 Product & Payment Link Creation via REST API
    """
    secret_key = secret_key.strip()
    if not secret_key.startswith("sk_"):
        print("❌ Error: Invalid Stripe Secret Key format. Should start with 'sk_live_' or 'sk_test_'")
        return

    print("⚡ Connecting to Stripe API...")

    # 1. Create Product
    prod_url = "https://api.stripe.com/v1/products"
    prod_data = urllib.parse.urlencode({
        "name": "Missed Call Auto SMS - Lifetime License",
        "description": "Standalone Android Appliance License. 0 Monthly Fees, 100% A2P 10DLC Exempt.",
    }).encode("utf-8")

    req = urllib.request.Request(prod_url, data=prod_data, method="POST")
    req.add_header("Authorization", f"Bearer {secret_key}")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urllib.request.urlopen(req) as resp:
            prod_res = json.loads(resp.read().decode("utf-8"))
            product_id = prod_res["id"]
            print(f"✅ Stripe Product Created: {product_id}")
    except Exception as e:
        print(f"❌ Failed to create Stripe product: {e}")
        return

    # 2. Create Price ($49.99 USD)
    price_url = "https://api.stripe.com/v1/prices"
    price_data = urllib.parse.urlencode({
        "product": product_id,
        "unit_amount": "4999", # $49.99 in cents
        "currency": "usd",
    }).encode("utf-8")

    req = urllib.request.Request(price_url, data=price_data, method="POST")
    req.add_header("Authorization", f"Bearer {secret_key}")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urllib.request.urlopen(req) as resp:
            price_res = json.loads(resp.read().decode("utf-8"))
            price_id = price_res["id"]
            print(f"✅ Stripe $49.99 Price Created: {price_id}")
    except Exception as e:
        print(f"❌ Failed to create Stripe price: {e}")
        return

    # 3. Create Payment Link
    link_url = "https://api.stripe.com/v1/payment_links"
    link_data = urllib.parse.urlencode({
        "line_items[0][price]": price_id,
        "line_items[0][quantity]": "1",
        "after_completion[type]": "hosted_confirmation",
    }).encode("utf-8")

    req = urllib.request.Request(link_url, data=link_data, method="POST")
    req.add_header("Authorization", f"Bearer {secret_key}")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urllib.request.urlopen(req) as resp:
            link_res = json.loads(resp.read().decode("utf-8"))
            payment_link_url = link_res["url"]
            print(f"🎉 SUCCESS! Created Stripe Payment Link: {payment_link_url}")
    except Exception as e:
        print(f"❌ Failed to create Payment Link: {e}")
        return

    # 4. Update sales_landing_page.html
    landing_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sales_landing_page.html")
    if os.path.exists(landing_path):
        with open(landing_path, "r", encoding="utf-8") as f:
            content = f.read()

        new_func = f'function initiateStripeCheckout() {{\n        window.location.href = "{payment_link_url}";\n    }}'
        content_updated = re.sub(r'function initiateStripeCheckout\(\)\s*\{[^}]*\}', new_func, content)

        with open(landing_path, "w", encoding="utf-8") as f:
            f.write(content_updated)

        print(f"✅ Updated sales_landing_page.html with your live Stripe Payment Link!")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        key = sys.argv[1]
    else:
        key = input("Enter your Stripe Secret Key (sk_live_... or sk_test_...): ")
    
    create_stripe_product_and_link(key)
