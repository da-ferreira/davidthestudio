export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public reasons?: string[],
  ) {
    super(message)
  }
}
