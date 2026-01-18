from cryptography.hazmat.primitives import serialization
import base64

# Load PRIVATE key
with open("private_key.pem", "rb") as f:
    private_key = serialization.load_pem_private_key(
        f.read(),
        password=None,
    )

# Extract raw private scalar (d)
private_value = private_key.private_numbers().private_value

# Convert to 32-byte big-endian
private_bytes = private_value.to_bytes(32, byteorder="big")

# Base64url encode (no padding)
private_b64url = base64.urlsafe_b64encode(private_bytes).rstrip(b"=").decode()

# Load PUBLIC key
with open("public_key.pem", "rb") as f:
    public_key = serialization.load_pem_public_key(f.read())

public_numbers = public_key.public_numbers()

# Uncompressed EC point: 0x04 || X || Y
x = public_numbers.x.to_bytes(32, "big")
y = public_numbers.y.to_bytes(32, "big")
public_bytes = b"\x04" + x + y

public_b64url = base64.urlsafe_b64encode(public_bytes).rstrip(b"=").decode()

print("VAPID_PRIVATE_KEY =", private_b64url)
print("Private key length:", len(private_b64url))
print("VAPID_PUBLIC_KEY  =", public_b64url)
print("Public key length:", len(public_b64url))
