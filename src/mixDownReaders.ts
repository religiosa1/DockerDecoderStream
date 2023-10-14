interface TaggedReadResult<TKey, T> {
  done: boolean;
  value: readonly [TKey, T | undefined];
}

export async function* mixDownReaders<TKey extends string, T>(
  readers: Record<TKey, ReadableStreamDefaultReader<T>>
) {
  const promisesMap = new Map<TKey, Promise<TaggedReadResult<TKey, T>>>(
    Object.keys(readers).map(key => {
      const tkey = key as TKey;
      return [tkey, readWithTag(readers[tkey], tkey)];
    })
  );

  do {
    const { done, value: [key, payload] } = await Promise.race(promisesMap.values());
    if (!done) {
      promisesMap.set(key, readWithTag(readers[key], key));
    } else {
      promisesMap.delete(key);
    }
    if (payload !== undefined) {
      yield [key, payload] as const;
    }
  } while (promisesMap.size);

  function readWithTag(reader: ReadableStreamDefaultReader<T>, tag: TKey): Promise<TaggedReadResult<TKey, T>> {
    return reader.read().then(({ value, done }) => {
      return { done, value: [tag, value] as const };
    });
  }
}