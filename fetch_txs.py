import urllib.request
import json

url = "https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=0xE9973a5b3dDc911163C2BB4d3621D75&startblock=0&endblock=99999999&page=1&offset=20&sort=desc"
req = urllib.request.urlopen(url)
data = json.loads(req.read())

print("Recent Contract Deployments:")
for tx in data.get('result', []):
    if tx.get('contractAddress'):
        print(f"Contract: {tx['contractAddress']} (Hash: {tx['hash']})")
