package main

import (
	"log"

	"github.com/vaultdrop/backend/config"
)

func main() {

	err, config := config.LoadApplicationConfig()

	if err != nil {
		log.Fatalln(err)
	}

}
