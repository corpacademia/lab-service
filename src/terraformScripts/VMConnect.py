import jwt
import sys
from datetime import datetime, timedelta

# Guacamole secret key (must match the Guacamole server's configuration)
SECRET_KEY = "4F9p2cINEx9vGnRkJVITMhJcZotzL0znSmiGEr4VXBQ="

# Validate input arguments
if len(sys.argv) < 6:
    print("Usage: script.py <os_type> <vm_id> <hostname> <username> <password> [port]")
    sys.exit(1)

protocol = sys.argv[1].strip().lower()    # 'linux' or 'windows'
vm_id = sys.argv[2].strip()              # Unique ID or name
hostname = sys.argv[3].strip()
username = sys.argv[4].strip()
password = sys.argv[5].strip()
port = sys.argv[6] if len(sys.argv) > 6 else ("22" if protocol == "ssh" else "3389")

# Build the payload for JWT
if protocol == "ssh":
    payload = {
        "GUAC_ID": f"vmware_linux_{vm_id}",
        "guac.hostname": hostname,
        "guac.protocol": "ssh",
        "guac.port": port,
        "guac.username": username,
        "guac.password": password,
        "exp": datetime.utcnow() + timedelta(seconds=36000)
    }

elif protocol == "rdp":
    payload = {
        "GUAC_ID": f"vmware_windows_{vm_id}",
        "guac.hostname": hostname,
        "guac.protocol": "rdp",
        "guac.port": port,
        "guac.username": username,
        "guac.password": password,
        "guac.ignore-cert": "true",
        "guac.security": "nla",
        "exp": datetime.utcnow() + timedelta(seconds=36000)
    }

else:
    print("Error: Unsupported OS type. Use 'linux' or 'windows'.")
    sys.exit(1)

# Generate JWT token
token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")

# Output the token
sys.stdout.write(token)