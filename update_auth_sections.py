#!/usr/bin/env python3
"""
Script to update the auth sections and env vars in the FitConnect API docs.
"""

import re

DOC_PATH = "/Users/harupadh3/Desktop/project/fitness-app/unpacked/word/document.xml"

# ─── XML helper snippets ────────────────────────────────────────────────────

def h1(text):
    """Heading 1 paragraph (same style as existing section headings)."""
    return f"""    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading1"/>
        <w:pBdr>
          <w:bottom w:val="single" w:color="1F3864" w:sz="6" w:space="4"/>
        </w:pBdr>
        <w:spacing w:after="180" w:before="360"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>
          <w:b/>
          <w:bCs/>
          <w:color w:val="1F3864"/>
          <w:sz w:val="32"/>
          <w:szCs w:val="32"/>
        </w:rPr>
        <w:t xml:space="preserve">{text}</w:t>
      </w:r>
    </w:p>"""

def h2(text):
    """Heading 2 paragraph (same style as existing endpoint headers)."""
    return f"""    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading2"/>
        <w:spacing w:after="120" w:before="300"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>
          <w:b/>
          <w:bCs/>
          <w:color w:val="2E75B6"/>
          <w:sz w:val="26"/>
          <w:szCs w:val="26"/>
        </w:rPr>
        <w:t xml:space="preserve">{text}</w:t>
      </w:r>
    </w:p>"""

def h3_bold(text):
    """Bold label paragraph used as a sub-section heading (H3 style)."""
    return f"""    <w:p>
      <w:pPr>
        <w:spacing w:after="60" w:before="180"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>
          <w:b/>
          <w:bCs/>
          <w:color w:val="1F3864"/>
          <w:sz w:val="22"/>
          <w:szCs w:val="22"/>
        </w:rPr>
        <w:t xml:space="preserve">{text}</w:t>
      </w:r>
    </w:p>"""

def para(text, before=80, after=80):
    """Normal body paragraph."""
    return f"""    <w:p>
      <w:pPr>
        <w:spacing w:after="{after}" w:before="{before}"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>
          <w:sz w:val="22"/>
          <w:szCs w:val="22"/>
        </w:rPr>
        <w:t xml:space="preserve">{text}</w:t>
      </w:r>
    </w:p>"""

def note_para(text):
    """Italic note paragraph."""
    return f"""    <w:p>
      <w:pPr>
        <w:spacing w:after="80" w:before="80"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>
          <w:i/>
          <w:iCs/>
          <w:color w:val="404040"/>
          <w:sz w:val="20"/>
          <w:szCs w:val="20"/>
        </w:rPr>
        <w:t xml:space="preserve">{text}</w:t>
      </w:r>
    </w:p>"""

def bold_label(text):
    """Bold label (e.g. 'Step 1 — ...', 'Request Body')."""
    return f"""    <w:p>
      <w:pPr>
        <w:spacing w:after="40" w:before="140"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>
          <w:b/>
          <w:bCs/>
          <w:sz w:val="22"/>
          <w:szCs w:val="22"/>
        </w:rPr>
        <w:t xml:space="preserve">{text}</w:t>
      </w:r>
    </w:p>"""

def spacer_small():
    """Small vertical spacer."""
    return """    <w:p>
      <w:pPr>
        <w:spacing w:after="0" w:before="0"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:sz w:val="80"/>
          <w:szCs w:val="80"/>
        </w:rPr>
        <w:t xml:space="preserve"/>
      </w:r>
    </w:p>"""

def spacer_large():
    """Large vertical spacer."""
    return """    <w:p>
      <w:pPr>
        <w:spacing w:after="0" w:before="0"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:sz w:val="120"/>
          <w:szCs w:val="120"/>
        </w:rPr>
        <w:t xml:space="preserve"/>
      </w:r>
    </w:p>"""

def page_break():
    return """    <w:p>
      <w:r>
        <w:br w:type="page"/>
      </w:r>
    </w:p>"""

def code_lines(lines):
    """A multi-line code block. lines is a list of strings."""
    paras = []
    for i, line in enumerate(lines):
        before = "100" if i == 0 else "0"
        after = "100" if i == len(lines) - 1 else "0"
        escaped = (line
                   .replace("&", "&amp;")
                   .replace("<", "&lt;")
                   .replace(">", "&gt;")
                   .replace('"', "&quot;"))
        paras.append(f"""    <w:p>
      <w:pPr>
        <w:shd w:fill="F2F2F2" w:val="clear"/>
        <w:spacing w:after="{after}" w:before="{before}"/>
        <w:ind w:left="360"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Courier New" w:cs="Courier New" w:eastAsia="Courier New" w:hAnsi="Courier New"/>
          <w:color w:val="333333"/>
          <w:sz w:val="18"/>
          <w:szCs w:val="18"/>
        </w:rPr>
        <w:t xml:space="preserve">{escaped}</w:t>
      </w:r>
    </w:p>""")
    return "\n".join(paras)

# ─── Table helpers ──────────────────────────────────────────────────────────

def table_header_cell(text, width):
    return f"""        <w:tc>
          <w:tcPr>
            <w:tcW w:type="dxa" w:w="{width}"/>
            <w:tcBorders>
              <w:top w:val="single" w:color="AAAAAA" w:sz="1"/>
              <w:left w:val="single" w:color="AAAAAA" w:sz="1"/>
              <w:bottom w:val="single" w:color="AAAAAA" w:sz="1"/>
              <w:right w:val="single" w:color="AAAAAA" w:sz="1"/>
            </w:tcBorders>
            <w:shd w:fill="2E75B6" w:val="clear"/>
            <w:tcMar>
              <w:top w:type="dxa" w:w="80"/>
              <w:left w:type="dxa" w:w="120"/>
              <w:bottom w:type="dxa" w:w="80"/>
              <w:right w:type="dxa" w:w="120"/>
            </w:tcMar>
            <w:vAlign w:val="center"/>
          </w:tcPr>
          <w:p>
            <w:r>
              <w:rPr>
                <w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>
                <w:b/>
                <w:bCs/>
                <w:color w:val="FFFFFF"/>
                <w:sz w:val="20"/>
                <w:szCs w:val="20"/>
              </w:rPr>
              <w:t xml:space="preserve">{text}</w:t>
            </w:r>
          </w:p>
        </w:tc>"""

def table_data_cell(text, width, fill="FFFFFF"):
    escaped = (text
               .replace("&", "&amp;")
               .replace("<", "&lt;")
               .replace(">", "&gt;"))
    return f"""        <w:tc>
          <w:tcPr>
            <w:tcW w:type="dxa" w:w="{width}"/>
            <w:tcBorders>
              <w:top w:val="single" w:color="AAAAAA" w:sz="1"/>
              <w:left w:val="single" w:color="AAAAAA" w:sz="1"/>
              <w:bottom w:val="single" w:color="AAAAAA" w:sz="1"/>
              <w:right w:val="single" w:color="AAAAAA" w:sz="1"/>
            </w:tcBorders>
            <w:shd w:fill="{fill}" w:val="clear"/>
            <w:tcMar>
              <w:top w:type="dxa" w:w="80"/>
              <w:left w:type="dxa" w:w="120"/>
              <w:bottom w:type="dxa" w:w="80"/>
              <w:right w:type="dxa" w:w="120"/>
            </w:tcMar>
          </w:tcPr>
          <w:p>
            <w:r>
              <w:rPr>
                <w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>
                <w:sz w:val="20"/>
                <w:szCs w:val="20"/>
              </w:rPr>
              <w:t xml:space="preserve">{escaped}</w:t>
            </w:r>
          </w:p>
        </w:tc>"""

def table_row(cells_xml):
    return f"""      <w:tr>
{cells_xml}
      </w:tr>"""

def make_table(total_width, col_widths, header_texts, rows):
    """
    header_texts: list of strings for header row
    rows: list of lists of (text, fill) tuples
    """
    assert len(col_widths) == len(header_texts)
    tbl_lines = [f"""    <w:tbl>
      <w:tblPr>
        <w:tblW w:type="dxa" w:w="{total_width}"/>
        <w:tblBorders>
          <w:top w:val="single" w:color="AAAAAA" w:sz="1"/>
          <w:left w:val="single" w:color="AAAAAA" w:sz="1"/>
          <w:bottom w:val="single" w:color="AAAAAA" w:sz="1"/>
          <w:right w:val="single" w:color="AAAAAA" w:sz="1"/>
          <w:insideH w:val="single" w:color="AAAAAA" w:sz="1"/>
          <w:insideV w:val="single" w:color="AAAAAA" w:sz="1"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>"""]
    for w in col_widths:
        tbl_lines.append(f"""        <w:gridCol w:w="{w}"/>""")
    tbl_lines.append("      </w:tblGrid>")
    # header row
    hdr_cells = "\n".join(table_header_cell(t, w) for t, w in zip(header_texts, col_widths))
    tbl_lines.append(f"""      <w:tr>
{hdr_cells}
      </w:tr>""")
    # data rows
    for row_data in rows:
        cells_xml = "\n".join(
            table_data_cell(cell[0], col_widths[i], cell[1] if len(cell) > 1 else "FFFFFF")
            for i, cell in enumerate(row_data)
        )
        tbl_lines.append(f"""      <w:tr>
{cells_xml}
      </w:tr>""")
    tbl_lines.append("    </w:tbl>")
    return "\n".join(tbl_lines)

# ─── Build: HOW TO AUTHENTICATE replacement ─────────────────────────────────

def build_how_to_authenticate():
    parts = []
    parts.append(page_break())
    parts.append(h1("How to Authenticate"))
    parts.append(para("Firebase handles all authentication. The mobile app signs in using the Firebase SDK &#x2014; the backend never sees passwords, OTPs, or OAuth codes directly."))
    parts.append(spacer_small())
    parts.append(bold_label("Step 1 &#x2014; Mobile signs in with Firebase (choose one)"))
    parts.append(para("The mobile app uses the Firebase SDK for the chosen provider:"))
    parts.append(spacer_small())
    parts.append(h3_bold("Google Sign-In"))
    parts.append(code_lines([
        "// Android",
        "val googleIdToken = googleSignInAccount.idToken",
        "val credential = GoogleAuthProvider.getCredential(googleIdToken, null)",
        "val firebaseUser = FirebaseAuth.getInstance().signInWithCredential(credential).await().user",
        "",
        "// iOS",
        "let credential = GoogleAuthProvider.credential(withIDToken: idToken, accessToken: accessToken)",
        "let result = try await Auth.auth().signIn(with: credential)",
    ]))
    parts.append(spacer_small())
    parts.append(h3_bold("Apple Sign-In"))
    parts.append(code_lines([
        "// Android",
        "val provider = OAuthProvider.newBuilder(\"apple.com\")",
        "val result = FirebaseAuth.getInstance().startActivityForSignInWithProvider(activity, provider.build()).await()",
        "",
        "// iOS",
        "let provider = OAuthProvider(providerID: \"apple.com\")",
        "let result = try await Auth.auth().signIn(with: provider)",
    ]))
    parts.append(spacer_small())
    parts.append(h3_bold("Phone OTP"))
    parts.append(code_lines([
        "// Android - Step 1: Send OTP (Firebase sends SMS automatically, no backend call needed)",
        "FirebaseAuth.getInstance().signInWithPhoneNumber(\"+919876543210\", timeout, activity, callbacks)",
        "",
        "// Android - Step 2: Verify OTP entered by user",
        "val credential = PhoneAuthProvider.getCredential(verificationId, smsCode)",
        "val firebaseUser = FirebaseAuth.getInstance().signInWithCredential(credential).await().user",
        "",
        "// iOS - Step 1: Send OTP",
        "try await PhoneAuthProvider.provider().verifyPhoneNumber(\"+919876543210\", uiDelegate: nil)",
        "",
        "// iOS - Step 2: Verify OTP",
        "let credential = PhoneAuthProvider.provider().credential(withVerificationID: id, verificationCode: smsCode)",
        "let result = try await Auth.auth().signIn(with: credential)",
    ]))
    parts.append(spacer_small())
    parts.append(bold_label("Step 2 &#x2014; Get Firebase ID Token"))
    parts.append(para("After any sign-in, get the Firebase ID token:"))
    parts.append(code_lines([
        "// Android",
        "val idToken = FirebaseAuth.getInstance().currentUser?.getIdToken(false)?.await()?.token",
        "",
        "// iOS",
        "let idToken = try await Auth.auth().currentUser?.getIDToken()",
    ]))
    parts.append(note_para("Note: This token is valid for 1 hour. The Firebase SDK refreshes it automatically &#x2014; no backend refresh endpoint needed."))
    parts.append(spacer_small())
    parts.append(bold_label("Step 3 &#x2014; Call POST /api/v1/auth/me"))
    parts.append(para("After getting the token, call this endpoint once to register in the backend database:"))
    parts.append(code_lines([
        "POST /api/v1/auth/me",
        "Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...",
    ]))
    parts.append(spacer_small())
    parts.append(bold_label("Step 4 &#x2014; Include token in every request"))
    parts.append(para("All subsequent API calls include the Firebase token as a Bearer token:"))
    parts.append(code_lines([
        "Authorization: Bearer <firebase_id_token>",
    ]))
    parts.append(para("The backend verifies this token on every request using Firebase Admin SDK. No session cookies, no backend JWT, no refresh endpoint needed."))
    parts.append(spacer_large())
    return "\n".join(parts)

# ─── Build: SECTION 1 — AUTHENTICATION replacement ──────────────────────────

def build_section1():
    parts = []
    parts.append(h1("1. AUTHENTICATION"))
    parts.append(para("Base URL prefix: /api/v1/auth"))
    parts.append(note_para("Firebase handles all sign-in flows (Google, Apple, Phone OTP) on the mobile device. The backend has only 2 auth endpoints. Both require a valid Firebase ID token in the Authorization header."))
    parts.append(spacer_large())

    # ── 1.1 Register / Fetch User ──
    parts.append(h2("1.1 Register / Fetch User"))
    # method/url line
    parts.append(f"""    <w:p>
      <w:pPr>
        <w:spacing w:after="60" w:before="120"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>
          <w:b/>
          <w:bCs/>
          <w:color w:val="0056b3"/>
          <w:sz w:val="22"/>
          <w:szCs w:val="22"/>
        </w:rPr>
        <w:t xml:space="preserve">POST</w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>
          <w:sz w:val="22"/>
          <w:szCs w:val="22"/>
        </w:rPr>
        <w:t xml:space="preserve">  /api/v1/auth/me</w:t>
      </w:r>
    </w:p>""")
    parts.append(para("Auth Required: Yes (Firebase token)"))
    parts.append(para("Called once after the mobile app signs in with Firebase. Creates a profile record in Supabase if this is a new user. Safe to call multiple times &#x2014; idempotent."))
    parts.append(spacer_small())

    # Headers table
    parts.append(bold_label("Headers"))
    hdr_table = make_table(
        9360, [3000, 4200, 2160],
        ["Header", "Value", "Required"],
        [
            [("Authorization", "FFFFFF"), ("Bearer <firebase_id_token>", "FFFFFF"), ("Yes", "FFFFFF")],
        ]
    )
    parts.append(hdr_table)
    parts.append(spacer_small())
    parts.append(para("No request body required."))
    parts.append(spacer_small())
    parts.append(bold_label("Success Response (200) &#x2014; existing user"))
    parts.append(code_lines([
        "{",
        "  \"user_id\": \"firebase-uid-28chars\",",
        "  \"is_new_user\": false,",
        "  \"onboarding_completed\": true,",
        "  \"user_type\": \"individual\"",
        "}",
    ]))
    parts.append(spacer_small())
    parts.append(bold_label("Success Response (200) &#x2014; new user first login"))
    parts.append(code_lines([
        "{",
        "  \"user_id\": \"firebase-uid-28chars\",",
        "  \"is_new_user\": true,",
        "  \"onboarding_completed\": false,",
        "  \"user_type\": null",
        "}",
    ]))
    parts.append(spacer_small())
    parts.append(note_para("Note: If is_new_user is true, redirect the user to the onboarding flow (POST /api/v1/profiles/onboard/individual or /professional)."))
    parts.append(spacer_large())

    # ── 1.2 Sign Out ──
    parts.append(h2("1.2 Sign Out"))
    parts.append(f"""    <w:p>
      <w:pPr>
        <w:spacing w:after="60" w:before="120"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>
          <w:b/>
          <w:bCs/>
          <w:color w:val="0056b3"/>
          <w:sz w:val="22"/>
          <w:szCs w:val="22"/>
        </w:rPr>
        <w:t xml:space="preserve">POST</w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>
          <w:sz w:val="22"/>
          <w:szCs w:val="22"/>
        </w:rPr>
        <w:t xml:space="preserve">  /api/v1/auth/signout</w:t>
      </w:r>
    </w:p>""")
    parts.append(para("Auth Required: Yes (Firebase token)"))
    parts.append(para("Revokes the user&#x2019;s Firebase refresh tokens server-side and removes their push notification device tokens from the database. The mobile app must also call FirebaseAuth.signOut() on the device."))
    parts.append(spacer_small())

    # Headers table
    parts.append(bold_label("Headers"))
    hdr_table2 = make_table(
        9360, [3000, 4200, 2160],
        ["Header", "Value", "Required"],
        [
            [("Authorization", "FFFFFF"), ("Bearer <firebase_id_token>", "FFFFFF"), ("Yes", "FFFFFF")],
        ]
    )
    parts.append(hdr_table2)
    parts.append(spacer_small())
    parts.append(para("No request body required."))
    parts.append(spacer_small())
    parts.append(bold_label("Mobile cleanup"))
    parts.append(code_lines([
        "// Android &#x2014; call after backend signout",
        "FirebaseAuth.getInstance().signOut()",
        "",
        "// iOS &#x2014; call after backend signout",
        "try Auth.auth().signOut()",
    ]))
    parts.append(spacer_small())
    parts.append(bold_label("Success Response (200)"))
    parts.append(code_lines([
        "{",
        "  \"message\": \"Signed out successfully\"",
        "}",
    ]))
    parts.append(spacer_large())
    return "\n".join(parts)

# ─── Build: Environment Variables section ───────────────────────────────────

def build_env_vars():
    parts = []
    parts.append(page_break())
    parts.append(h1("Environment Variables Reference"))
    parts.append(para("Configure the backend with the following environment variables:"))
    parts.append(spacer_small())

    rows = [
        [("SUPABASE_URL", "FFFFFF"),             ("Yes", "FFFFFF"),  ("Supabase project URL &#x2014; used for database access only", "FFFFFF")],
        [("SUPABASE_SERVICE_ROLE_KEY", "EBF3FB"), ("Yes", "EBF3FB"), ("Service role key &#x2014; bypasses RLS, server-only, never expose to clients", "EBF3FB")],
        [("FIREBASE_PROJECT_ID", "FFFFFF"),       ("Yes", "FFFFFF"), ("Firebase project ID (from Firebase Console &#x2192; Project Settings &#x2192; Service Accounts)", "FFFFFF")],
        [("FIREBASE_PRIVATE_KEY", "EBF3FB"),      ("Yes", "EBF3FB"), ("Private key from Firebase service account JSON file", "EBF3FB")],
        [("FIREBASE_CLIENT_EMAIL", "FFFFFF"),     ("Yes", "FFFFFF"), ("Service account email from Firebase service account JSON file", "FFFFFF")],
        [("PORT", "EBF3FB"),                      ("No", "EBF3FB"),  ("Server port (default: 3000)", "EBF3FB")],
        [("HOST", "FFFFFF"),                      ("No", "FFFFFF"),  ("Bind address (default: 0.0.0.0)", "FFFFFF")],
        [("NODE_ENV", "EBF3FB"),                  ("No", "EBF3FB"),  ("development or production", "EBF3FB")],
    ]

    env_table = make_table(
        9360, [2880, 1080, 5400],
        ["Variable", "Required", "Description"],
        rows
    )
    parts.append(env_table)
    parts.append(spacer_small())
    parts.append(note_para("SUPABASE_ANON_KEY and JWT_SECRET are no longer required. Firebase handles all authentication &#x2014; Supabase is used as a database only."))
    parts.append(spacer_large())
    return "\n".join(parts)

# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    with open(DOC_PATH, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.split("\n")
    print(f"Total lines in document: {len(lines)}")

    # ── 1. Replace HOW TO AUTHENTICATE section (lines 360-462, 0-indexed: 359-461)
    # The section is the page-break paragraph + heading + content until spacer_large at end
    # From the analysis:
    # Line 360 (1-indexed) = index 359: <w:p> containing the page break
    # Line 462 (1-indexed) = index 461: </w:p> ending the last spacer paragraph before Section 1 heading
    # Line 463 (1-indexed) = index 462: <w:p> starting Section 1 heading
    how_to_start = 359   # 0-indexed (line 360 in 1-indexed)
    how_to_end   = 462   # 0-indexed exclusive (line 463 in 1-indexed is start of Section 1)

    # ── 2. Replace SECTION 1 — AUTHENTICATION (lines 463-3807, 0-indexed: 462-3806)
    # Line 463 (1-indexed) = index 462: start of Section 1 heading
    # Line 3807 (1-indexed) = index 3806: </w:p> ending last para before Section 2
    # Line 3808 (1-indexed) = index 3807: <w:p> starting Section 2 heading
    section1_start = 462   # 0-indexed
    section1_end   = 3807  # 0-indexed exclusive (line 3808 starts Section 2)

    new_how_to   = build_how_to_authenticate()
    new_section1 = build_section1()
    new_env_vars = build_env_vars()

    # Verify boundary lines
    print(f"Line 360 (should be page-break <w:p>): {lines[359][:60]}")
    print(f"Line 463 (should be <w:p> Section 1 heading): {lines[462][:60]}")
    print(f"Line 3808 (should be Section 2 heading <w:p>): {lines[3807][:60]}")
    print(f"Last line: {lines[-1][:80]}")

    # Build new lines
    before_how_to    = lines[:how_to_start]
    between          = lines[section1_start:section1_start]   # empty
    after_section1   = lines[section1_end:]

    # The final document body
    new_lines = (
        before_how_to
        + new_how_to.split("\n")
        + new_section1.split("\n")
        + after_section1
    )

    new_content = "\n".join(new_lines)

    # ── 3. Insert Environment Variables section before </w:sectPr>
    # We insert it before the <w:sectPr> tag (which is the last section before </w:body>)
    env_xml = new_env_vars
    # Find the position of <w:sectPr> near the end
    sect_pr_pos = new_content.rfind("    <w:sectPr>")
    if sect_pr_pos == -1:
        print("ERROR: Could not find <w:sectPr>!")
        return
    print(f"Found <w:sectPr> at position {sect_pr_pos}")
    new_content = new_content[:sect_pr_pos] + env_xml + "\n" + new_content[sect_pr_pos:]

    with open(DOC_PATH, "w", encoding="utf-8") as f:
        f.write(new_content)

    new_lines_count = new_content.count("\n") + 1
    print(f"Done! New document has ~{new_lines_count} lines.")
    print("Updated: HOW TO AUTHENTICATE section, SECTION 1 AUTHENTICATION, and added Environment Variables Reference.")

if __name__ == "__main__":
    main()
