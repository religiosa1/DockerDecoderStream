export async function* mixDownReaders<TKey extends string, T>(
  readers: Record<TKey, ReadableStreamReader<T>>
) {
  const promisesMap = new Map<TKey, Promise<{
    done: boolean;
    value: readonly [TKey, T | undefined];
  }>>(
    Object.keys(readers).map(key => [key as TKey, armPromise(key as TKey)] as const)
  );

  do {
    const { done, value: [key, payload] } = await Promise.race(
      promisesMap.values()
    );
    if (!done) {
      promisesMap.set(key, armPromise(key));
    } else {
      promisesMap.delete(key);
    }
    if (payload !== undefined) {
      yield [key, payload] as const;
    }
  } while (promisesMap.size);

  function armPromise(key: TKey) {
    const reader = readers[key] as ReadableStreamDefaultReader<T>;
    const prms = reader.read().then(({ value, done }) => {
      return { done, value: [key, value] as const };
    });
    return prms;
  }
}