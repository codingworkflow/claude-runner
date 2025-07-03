import { tokens } from "./tokens";

export const createTokenStyles = (tokenKey: keyof typeof tokens) => {
  return tokens[tokenKey];
};
