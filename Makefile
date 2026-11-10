PYTHON ?= python3
.PHONY: run pack test docker-build docker-run
run:
	$(PYTHON) main.py
pack:
	$(PYTHON) main.py --pack
test:
	$(PYTHON) tests/test_pack.py
	$(PYTHON) tests/smoke.py
docker-build:
	docker build -t shop-python .
docker-run:
	docker run --rm -p 127.0.0.1:8000:8000 shop-python
