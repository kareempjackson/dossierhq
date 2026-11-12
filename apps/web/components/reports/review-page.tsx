/** When every draft has been read, or none were drafted yet. */
export function NothingToReview() {
  return (
    <div className="grid flex-1 place-items-center rounded-2xl bg-grey-1 p-10 text-center">
      <div>
        <p className="font-display text-h2">Nothing to review.</p>
        <p className="mt-2 max-w-md text-small text-muted">
          Each client’s weekly report is drafted here for you to read before it
          goes out, on the delivery schedule or when you draft them now.
        </p>
      </div>
    </div>
  );
}
