import subprocess
import tempfile
import os
import shutil
import re
import json

base_ref = "ed111462cfe77c4d764657abc5a079fe6386d19b"
temp_dir = tempfile.mkdtemp(prefix="tsc_base_test_", dir=os.path.dirname(os.getcwd()))
print("Cloning base archive to:", temp_dir)

try:
    archive_path = os.path.join(temp_dir, "base.tar")
    subprocess.check_call(["git", "archive", "--format=tar", "-o", archive_path, base_ref])
    import tarfile
    with tarfile.open(archive_path) as tar:
        tar.extractall(temp_dir)
    os.remove(archive_path)

    ws_node_modules = os.path.abspath("node_modules")
    temp_node_modules = os.path.join(temp_dir, "node_modules")
    if os.path.exists(temp_node_modules):
        shutil.rmtree(temp_node_modules, ignore_errors=True)
    cmd_mklink = f'mklink /J "{temp_node_modules}" "{ws_node_modules}"'
    subprocess.check_call(cmd_mklink, shell=True)

    tsc_bin = os.path.join(ws_node_modules, "typescript", "bin", "tsc")
    print("Running tsc on base commit...")
    base_res = subprocess.run(["node", "--max-old-space-size=8192", tsc_bin, "--noEmit"], cwd=temp_dir, capture_output=True, text=True)
    with open("scripts/tsc_base_raw.txt", "w", encoding="utf-8") as f:
        f.write(base_res.stdout + "\n" + base_res.stderr)

    print("Running tsc on candidate working directory...")
    cand_res = subprocess.run(["node", "--max-old-space-size=8192", tsc_bin, "--noEmit"], cwd=os.getcwd(), capture_output=True, text=True)
    with open("scripts/tsc_candidate_raw.txt", "w", encoding="utf-8") as f:
        f.write(cand_res.stdout + "\n" + cand_res.stderr)

    pat = re.compile(r"^(.*?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$", re.MULTILINE)
    base_errs = pat.findall(base_res.stdout)
    cand_errs = pat.findall(cand_res.stdout)

    base_set = set((m[0].replace("\\", "/"), m[3], m[4]) for m in base_errs)
    cand_set = set((m[0].replace("\\", "/"), m[3], m[4]) for m in cand_errs)

    added = cand_set - base_set
    removed = base_set - cand_set

    summary = {
        "base_ref": base_ref,
        "base_errs_count": len(base_errs),
        "base_unique_count": len(base_set),
        "cand_errs_count": len(cand_errs),
        "cand_unique_count": len(cand_set),
        "newly_added_count": len(added),
        "removed_count": len(removed),
        "newly_added": [list(x) for x in added]
    }

    with open("scripts/tsc_diff_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print("=== TYPESCRIPT COMPARISON RESULT ===")
    print(f"Base commit errors: {len(base_errs)}")
    print(f"Candidate errors: {len(cand_errs)}")
    print(f"Newly introduced errors: {len(added)}")
    print(f"Removed errors: {len(removed)}")

finally:
    subprocess.call(["cmd", "/c", f'rmdir "{os.path.join(temp_dir, "node_modules")}"'], shell=True)
    shutil.rmtree(temp_dir, ignore_errors=True)
