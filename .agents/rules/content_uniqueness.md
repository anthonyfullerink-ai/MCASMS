# Workspace Guidelines: Missed Call Auto SMS

## 1. Content & Media Uniqueness (STRICT MANDATE)
- **Zero Image Reuse**: Every new blog post, social media post, ad creative, and marketing asset **MUST** have a 100% unique, bespoke image.
- **Never Recycle Visuals**: Do NOT reuse images from existing blog posts, social campaigns, or previous assets. Each piece of content must tell its own visual story.
- **Image Creation Workflow**:
  1. When drafting a new article or social post, determine a distinct visual concept directly representing the article core hook (e.g., specific trade setting, carrier towers, invoice comparison, hardware appliance).
  2. Use generate_image (aspect ratio 16:9 for blogs/social or 1:1 for square social feeds) to generate a bespoke high-resolution image.
  3. Save the generated asset into assets/social/<unique-descriptive-name>.jpg.
  4. Register the unique URL in blog/posts.json, blog/posts/<slug>.html (og:image, twitter:image, and banner img), and social distribution scripts.
- **Unique Copy & Angles**: Every blog post and social post must feature original arguments, fresh industry data, distinct headlines, and unique takeaways.

---

## 2. Secrets & Security Integrity
- **Zero Exposed Secrets**: Never write or commit raw secret keys (sk_live_, AIzaSy, EAAP, re_) to git-tracked files or public web assets.
- Always use environment variables (process.env.STRIPE_SECRET_KEY, process.env.RESEND_API_KEY, etc.) and .env (gitignored).

---

## 3. Stripe & Billing Conventions
- **3-Day Free Trial ($0.00 Today)**:
  https://buy.stripe.com/5kQ5kDbBI8hkdao8WZ2go0c (Native 3-day subscription trial, displaying $0.00 due today, converting to $49.99 lifetime after day 3).
- **Standard Flagship Direct Buy ($49.99)**:
  https://buy.stripe.com/3cI9AT49g2X07Q41ux2go0a
- **Pro Automation Edition Direct Buy ($149.99)**:
  https://buy.stripe.com/cNi5kDdJQ558c6k2yB2go0b