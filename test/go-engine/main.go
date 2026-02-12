package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"sort"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
)

func main() {
	ctx := context.Background()

	databaseContainer, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("jobs"),
		postgres.WithUsername("user"),
		postgres.WithPassword("password"),
		postgres.BasicWaitStrategies(),
	)
	if err != nil {
		panic(err)
	}

	dbURL, err := databaseContainer.ConnectionString(ctx)
	if err != nil {
		panic(err)
	}

	// Write the database URL to a JSON file for the test runner to read
	f, err := os.Create("/tmp/db-url.json")
	if err != nil {
		panic(err)
	}
	_, err = f.WriteString(fmt.Sprintf(`{"url": "%s"}`, dbURL))
	if err != nil {
		panic(err)
	}
	f.Close()

	dbPool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		panic(err)
	}

	driver := riverpgxv5.New(dbPool)
	migrator, err := rivermigrate.New(driver, nil)
	if err != nil {
		panic(err)
	}

	if _, err = migrator.Migrate(ctx, rivermigrate.DirectionUp, nil); err != nil {
		panic(err)
	}

	workers := river.NewWorkers()
	if err = river.AddWorkerSafely(workers, &SortWorker{}); err != nil {
		panic(err)
	}

	riverClient, err := river.NewClient(driver, &river.Config{
		JobTimeout: 1 * time.Minute,
		Queues: map[string]river.QueueConfig{
			river.QueueDefault: {MaxWorkers: 100},
		},
		Workers: workers,
	})
	if err != nil {
		panic(err)
	}

	if err := riverClient.Start(ctx); err != nil {
		panic(err)
	}

	// Wait for quit signal (SIGINT or SIGTERM)
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	if err := riverClient.Stop(ctx); err != nil {
		fmt.Println("Error stopping river client:", err.Error())
	}

	if err := databaseContainer.Terminate(ctx); err != nil {
		fmt.Println("Error terminating database container:", err.Error())
	}
}

type SortArgs struct {
	Strings []string `json:"strings"`
}

func (SortArgs) Kind() string {
	return "sort_args"
}

type SortWorker struct {
	river.WorkerDefaults[SortArgs]
}

func (w *SortWorker) Work(ctx context.Context, job *river.Job[SortArgs]) error {
	args := job.Args
	if args.Strings != nil {
		sort.Strings(args.Strings)
		// Write sorted strings to a temp file for test verification
		f, err := os.Create("/tmp/sorted-strings.json")
		if err == nil {
			type result struct {
				Sorted []string `json:"sorted"`
			}
			b, _ := json.Marshal(result{Sorted: args.Strings})
			_, _ = f.Write(b)
			f.Close()
		}
	}
	return nil
}
