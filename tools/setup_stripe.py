import os
import sys
import json
import urllib.request
import urllib.parse
import re

def load_env_file():
    """
    Parses local .env file
    """
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    env_vars = {}
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env_vars[k.strip()] = v.strip().strip("\"'")
    return env_vars

def create_stripe_product_and_link(secret_key):
    """
    Automates Stripe $49.99 Product & Payment Link Creation via REST API
    """
    secret_key = secret_key.strip()
    if not secret_key.startswith("sk_"):
        print("❌ Error: Invalid Stripe Secret Key. Must start with 'sk_live_' or 'sk_test_'.")
        print("   Please edit your .env file and set STRIPE_SECRET_KEY=sk_test_...")
        return

    print(f"⚡ Connecting to Stripe API with key ({secret_key[:7]}...)...")

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
            print(f"✅ Standard Stripe Product Created: {product_id}")
    except Exception as e:
        print(f"❌ Failed to create Stripe product: {e}")
        return

    # 2. Create Standard Price ($49.99 USD)
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
            print(f"✅ Standard $49.99 Price Created: {price_id}")
    except Exception as e:
        print(f"❌ Failed to create Stripe price: {e}")
        return

    # 3. Create Standard Payment Link
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
            print(f"🎉 Standard Payment Link Created: {payment_link_url}")
    except Exception as e:
        print(f"❌ Failed to create Payment Link: {e}")
        return

    # 4. Create Pro Automation Product & Price ($149.99 USD)
    pro_prod_data = urllib.parse.urlencode({
        "name": "Missed Call Auto SMS - Pro Automation Edition",
        "description": "Unlimited n8n Webhook Automations, FCM Cloud Push, Dual SIM Outbound Line Selector, 100% A2P 10DLC Exempt.",
        "metadata[tier]": "pro_automation"
    }).encode("utf-8")

    req = urllib.request.Request(prod_url, data=pro_prod_data, method="POST")
    req.add_header("Authorization", f"Bearer {secret_key}")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urllib.request.urlopen(req) as resp:
            pro_prod_res = json.loads(resp.read().decode("utf-8"))
            pro_product_id = pro_prod_res["id"]
            print(f"✅ Pro Automation Product Created: {pro_product_id}")
    except Exception as e:
        print(f"❌ Failed to create Pro product: {e}")
        return

    pro_price_data = urllib.parse.urlencode({
        "product": pro_product_id,
        "unit_amount": "14999", # $149.99 in cents
        "currency": "usd",
    }).encode("utf-8")

    req = urllib.request.Request(price_url, data=pro_price_data, method="POST")
    req.add_header("Authorization", f"Bearer {secret_key}")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urllib.request.urlopen(req) as resp:
            pro_price_res = json.loads(resp.read().decode("utf-8"))
            pro_price_id = pro_price_res["id"]
            print(f"✅ Pro $149.99 Price Created: {pro_price_id}")
    except Exception as e:
        print(f"❌ Failed to create Pro price: {e}")
        return

    pro_link_data = urllib.parse.urlencode({
        "line_items[0][price]": pro_price_id,
        "line_items[0][quantity]": "1",
        "metadata[tier]": "pro_automation",
        "after_completion[type]": "hosted_confirmation",
    }).encode("utf-8")

    req = urllib.request.Request(link_url, data=pro_link_data, method="POST")
    req.add_header("Authorization", f"Bearer {secret_key}")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urllib.request.urlopen(req) as resp:
            pro_link_res = json.loads(resp.read().decode("utf-8"))
            pro_payment_link_url = pro_link_res["url"]
            print(f"🎉 Pro Payment Link Created: {pro_payment_link_url}")
    except Exception as e:
        print(f"❌ Failed to create Pro Payment Link: {e}")
        return

    # 5. Update HTML files
    for file_name in ["sales_landing_page.html", "index.html"]:
        fpath = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), file_name)
        if os.path.exists(fpath):
            with open(fpath, "r", encoding="utf-8") as f:
                content = f.read()

            new_std = f'function initiateStripeCheckout() {{\n        window.location.href = "{payment_link_url}";\n    }}'
            new_trial = f'function initiateFreeTrialCheckout() {{\n        window.location.href = "{payment_link_url}?trial_period_days=3";\n    }}'
            new_pro = f'function initiateProStripeCheckout() {{\n        window.location.href = "{pro_payment_link_url}";\n    }}'

            content = re.sub(r'function initiateStripeCheckout\(\)\s*\{[^}]*\}', new_std, content)
            content = re.sub(r'function initiateFreeTrialCheckout\(\)\s*\{[^}]*\}', new_trial, content)
            content = re.sub(r'function initiateProStripeCheckout\(\)\s*\{[^}]*\}', new_pro, content)

            with open(fpath, "w", encoding="utf-8") as f:
                f.write(content)

            print(f"✅ Updated {file_name} with live Standard and Pro Payment Links!")

if __name__ == "__main__":
    env_vars = load_env_file()
    key = env_vars.get("STRIPE_SECRET_KEY", "")

    if len(sys.argv) > 1:
        key = sys.argv[1]
    
    if not key or "your_secret_key_here" in key:
        print("📁 Reading from .env file...")
        key = input("Enter your Stripe Secret Key (sk_live_... or sk_test_...): ")

    create_stripe_product_and_link(key)
