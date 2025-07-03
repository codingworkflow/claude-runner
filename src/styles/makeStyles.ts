import { useMemo } from "react";

type StyleObject = Record<string, React.CSSProperties>;
type StyleFunction<T extends StyleObject> = () => T;

export function makeStyles<T extends StyleObject>(styles: T): StyleFunction<T> {
  return function useStyles(): T {
    return useMemo(() => styles, []);
  };
}

export function mergeClasses(...classes: (string | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
