from __future__ import annotations
import argparse, json, os, sys, pandas as pd

def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    boot = sub.add_parser("bootstrap", help="download base reference data")
    boot.add_argument("--season", type=int, required=True)

    wk = sub.add_parser("weekly", help="compute weekly features and print decisions")
    wk.add_argument("--season", type=int, required=True)
    wk.add_argument("--week", type=int, required=True)
    wk.add_argument("--league_source", choices=["sleeper","yahoo"], required=False, default="sleeper")
    wk.add_argument("--league_id", type=str, required=False)

    args = ap.parse_args()

    if args.cmd == "bootstrap":
        print(f"[bootstrap] stub — fetch rosters/schedules/players for season {args.season}.")
        sys.exit(0)

    if args.cmd == "weekly":
        from .features.build_week import build_week
        outdir = ".cache/season{}_week{}".format(args.season, args.week)
        os.makedirs(outdir, exist_ok=True)
        print(f"[weekly] downloading + building features for {args.season} wk {args.week} …")
        feats, events, lines = build_week(args.season, args.week)
        feats.to_csv(os.path.join(outdir, "weekly_features.csv"), index=False)
        events.to_csv(os.path.join(outdir, "events.csv"), index=False)
        if lines is not None and len(lines):
            lines.to_csv(os.path.join(outdir, "lines.csv"), index=False)
        print(f"[weekly] wrote: {outdir}/weekly_features.csv ({len(feats)} rows)")
        print(f"[weekly] wrote: {outdir}/events.csv ({len(events)} rows)")
        if lines is not None and len(lines):
            print(f"[weekly] wrote: {outdir}/lines.csv ({len(lines)} rows)")
        sys.exit(0)

if __name__ == "__main__":
    main()
